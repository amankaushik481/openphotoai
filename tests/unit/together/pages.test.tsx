/** Server-render smoke tests for /app/together and /invites/[token] (mocked session + router). */
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import InvitePage from "@/app/invites/[token]/page";
import TogetherPage from "@/app/app/together/page";
import type { IdentityModelRow, UserRow } from "@/db/types";
import { createTestDb, createTestModel, createTestUser, sessionMock } from "../../helpers/factories";
import { insertShare, useTempStorage } from "./helpers";

vi.mock("@/server/auth/session", async () => (await import("../../helpers/session")).sessionMock);
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

let cleanupStorage: () => Promise<void>;
beforeAll(async () => {
  cleanupStorage = await useTempStorage();
});
afterAll(async () => {
  await cleanupStorage();
});

let alice: UserRow;
let bob: UserRow;
let eve: UserRow;
let bobModel: IdentityModelRow;

beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
  alice = await createTestUser({ name: "Alice", email: "alice@example.com" });
  bob = await createTestUser({ name: "Bob", email: "bob@example.com" });
  eve = await createTestUser({ name: "Eve", email: "eve@example.com" });
  bobModel = await createTestModel(bob.id, { name: "Bobby" });
});

const invitePage = async (token: string) =>
  renderToStaticMarkup(await InvitePage({ params: Promise.resolve({ token }) }));

describe("/invites/[token]", () => {
  it("shows the inviter, message, consent explanation and the invitee's models", async () => {
    const { token, share } = await insertShare({ requester: alice, status: "pending", email: bob.email });
    const { db } = await import("@/db");
    const { modelShares } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(modelShares).set({ message: "Trip album <3" }).where(eq(modelShares.id, share.id));

    sessionMock.setUser(bob);
    const html = await invitePage(token);
    expect(html).toContain("Alice wants to take photos with you");
    expect(html).toContain("alice@example.com");
    expect(html).toContain("Trip album &lt;3");
    expect(html).toContain("What accepting means");
    expect(html).toContain("Bobby");
    expect(html).toContain("Accept and share");
    expect(html).toContain("Decline");
  });

  it("offers to create a model when the invitee has none", async () => {
    const { token } = await insertShare({ requester: bob, status: "pending", email: alice.email });
    sessionMock.setUser(alice);
    const html = await invitePage(token);
    expect(html).toContain("/app/models/new");
  });

  it("never shows invite details to another account", async () => {
    const { token } = await insertShare({ requester: alice, status: "pending", email: bob.email });
    sessionMock.setUser(eve);
    const html = await invitePage(token);
    expect(html).toContain("This invite is for someone else");
    expect(html).toContain("bo***@example.com");
    expect(html).not.toContain("bob@example.com");
    expect(html).not.toContain("Alice");
  });

  it("explains closed and unknown invites", async () => {
    const { token } = await insertShare({ requester: alice, owner: bob, model: bobModel });
    sessionMock.setUser(bob);
    expect(await invitePage(token)).toContain("You already accepted");
    expect(await invitePage("unknown-token")).toContain("This invite link doesn");
  });

  it("redirects signed-out visitors to sign in", async () => {
    await expect(invitePage("some-token")).rejects.toMatchObject({ digest: expect.stringContaining("/login?next=") });
  });
});

describe("/app/together", () => {
  it("renders own + partner models, the invite form and invites", async () => {
    const aliceModel = await createTestModel(alice.id, { name: "Ally" });
    await insertShare({ requester: alice, owner: bob, model: bobModel });
    await insertShare({ requester: alice, status: "pending", email: "carol@example.com" });
    sessionMock.setUser(alice);

    const html = renderToStaticMarkup(await TogetherPage());
    expect(html).toContain("Together photos");
    expect(html).toContain(aliceModel.name);
    expect(html).toContain("Bobby");
    expect(html).toContain("Shared by Bob");
    expect(html).toContain("Invite a friend");
    expect(html).toContain("carol@example.com");
    expect(html).toContain("Bob shared “Bobby”");
  });

  it("asks for an own model first", async () => {
    sessionMock.setUser(eve);
    const html = renderToStaticMarkup(await TogetherPage());
    expect(html).toContain("Start with your own model");
  });
});
