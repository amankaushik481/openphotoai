import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { db } from "@/db";
import { emailOutbox } from "@/db/schema";
import { acceptInvite, createTeam, getInvitePreview, inviteMember } from "@/server/teams";
import { createTestDb, createTestUser } from "../../helpers/db";
import { studioUser } from "./fixtures";

vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyModuleMock);

beforeEach(async () => {
  await createTestDb();
});

it("renders the real team_invite email with a working join link", async () => {
  const owner = await studioUser();
  const team = await createTeam(owner, "Acme Design");
  await inviteMember(owner, team.id, "Friend@Example.com");

  const [email] = await db.select().from(emailOutbox).where(eq(emailOutbox.to, "friend@example.com"));
  expect(email).toMatchObject({ template: "team_invite", status: "mocked" });
  expect(email!.subject).toContain("Acme Design");
  const token = email!.html.match(/\/teams\/join\/([A-Za-z0-9]+)/)?.[1];
  expect(token).toBeDefined();

  expect(await getInvitePreview(token!)).toMatchObject({ teamName: "Acme Design", email: "friend@example.com" });
  const friend = await createTestUser({ email: "friend@example.com" });
  await expect(acceptInvite(friend, token!)).resolves.toMatchObject({ team: { id: team.id } });
});
