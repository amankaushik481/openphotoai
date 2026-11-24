import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, createTestUser } from "../../helpers/db";
import type { UserRow } from "@/db/types";
import { AppError } from "@/server/http";
import { assertTextAllowed } from "@/server/safety";
import { MOCK_BLOCK_TEXT_TOKEN } from "@/providers/mock/moderation";
import { brokenModeration, eventsOf, providers, useMockProviders } from "./fixtures";

vi.mock("@/providers/registry", async () => (await import("./fixtures")).registryMock);

let user: UserRow;
beforeEach(async () => {
  await createTestDb();
  user = await createTestUser();
  useMockProviders();
});

async function blocked(texts: string[]): Promise<AppError> {
  const err = await assertTextAllowed(texts, { userId: user.id, jobId: "job_1" }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

describe("assertTextAllowed", () => {
  it("allows clean prompts and records nothing", async () => {
    await expect(assertTextAllowed(["studio headshot, navy blazer", "  "], { userId: user.id })).resolves.toBeUndefined();
    expect(await eventsOf(user.id)).toHaveLength(0);
  });

  it("does nothing for an empty list", async () => {
    const spy = vi.spyOn(providers.moderation!, "checkText");
    await assertTextAllowed([], { userId: user.id });
    expect(spy).not.toHaveBeenCalled();
  });

  it("blocks rule matches before calling the provider and records a redacted event", async () => {
    const spy = vi.spyOn(providers.moderation!, "checkText");
    const longPrompt = `a sexy photo ${"x".repeat(500)}`;
    const err = await blocked([longPrompt]);
    expect(err.code).toBe("content_blocked");
    expect(err.message).toMatch(/sexual or suggestive/i);
    expect(err.details).toEqual({ categories: ["sexual"] });
    expect(spy).not.toHaveBeenCalled();

    const [event] = await eventsOf(user.id, "prompt_blocked");
    expect(event).toBeDefined();
    expect(event!.jobId).toBe("job_1");
    const details = event!.details as { source: string; categories: string[]; text: { excerpt: string; sha256: string } };
    expect(details.source).toBe("rules");
    expect(details.categories).toEqual(["sexual"]);
    expect(details.text.excerpt.length).toBeLessThanOrEqual(200);
    expect(details.text.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(event!.details)).not.toContain("x".repeat(250));
  });

  it("shows the most severe category's message (minors over sexual)", async () => {
    const err = await blocked(["sexy teen"]);
    expect(err.message).toMatch(/adults only/i);
    expect(err.details).toEqual({ categories: ["minors", "sexual"] });
  });

  it("records public-figure-only blocks as public_figure", async () => {
    const err = await blocked(["me with Taylor Swift"]);
    expect(err.message).toMatch(/public figures/i);
    expect(await eventsOf(user.id, "public_figure")).toHaveLength(1);
    expect(await eventsOf(user.id, "prompt_blocked")).toHaveLength(0);
  });

  it("blocks when the moderation provider blocks", async () => {
    const err = await blocked(["a nice photo", `portrait ${MOCK_BLOCK_TEXT_TOKEN}`]);
    expect(err.code).toBe("content_blocked");
    const [event] = await eventsOf(user.id, "prompt_blocked");
    expect((event!.details as { source: string }).source).toBe("provider");
  });

  it("blocks when the provider reports a sexual/minors category even if it says allowed", async () => {
    vi.spyOn(providers.moderation!, "checkText").mockResolvedValue({
      allowed: true,
      categories: ["sexual/minors"],
      provider: "inconsistent",
    });
    const err = await blocked(["an ordinary prompt"]);
    expect(err.message).toMatch(/adults only/i);
  });

  it("fails closed when the provider throws", async () => {
    providers.moderation = brokenModeration();
    const err = await blocked(["an ordinary prompt"]);
    expect(err.code).toBe("content_blocked");
    expect(err.details).toEqual({ categories: ["moderation_error"] });
    const [event] = await eventsOf(user.id, "prompt_blocked");
    expect((event!.details as { error: string }).error).toContain("moderation backend down");
  });

  it("fails closed when no provider is configured", async () => {
    providers.moderation = null;
    const err = await blocked(["an ordinary prompt"]);
    expect(err.details).toEqual({ categories: ["moderation_error"] });
  });
});
