import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { creditLedger } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { getBalance } from "@/server/credits/ledger";
import { AppError } from "@/server/http";
import {
  acceptInvite,
  createTeam,
  inviteMember,
  removeMember,
  transferCredits,
  updateMemberRole,
} from "@/server/teams";
import { createTestDb, createTestUser } from "../../helpers/db";
import { inviteTokenFor, resetTeamMocks, studioUser } from "./fixtures";

const ledgerControl = vi.hoisted(() => ({ failTransferIn: false }));

vi.mock("@/server/email", async () => (await import("./fixtures")).emailModuleMock);
vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyModuleMock);
vi.mock("@/server/credits/ledger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/credits/ledger")>();
  return {
    ...actual,
    applyCredit: vi.fn(async (...args: Parameters<typeof actual.applyCredit>) => {
      if (ledgerControl.failTransferIn && args[0].reason === "transfer_in") throw new Error("simulated crash");
      return actual.applyCredit(...args);
    }),
  };
});

async function rejection(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => {
      throw new Error("expected a rejection");
    },
    (e: unknown) => e,
  );
}

async function code(p: Promise<unknown>): Promise<string> {
  const err = await rejection(p);
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).code;
}

async function ledgerOf(userId: string) {
  return db.select().from(creditLedger).where(eq(creditLedger.userId, userId));
}

let owner: UserRow;
let member: UserRow;
let teamId: string;
let memberRowId: string;
beforeEach(async () => {
  await createTestDb();
  resetTeamMocks();
  ledgerControl.failTransferIn = false;
  owner = await studioUser({ credits: 100 });
  member = await createTestUser({ credits: 5, name: "Mia Member" });
  teamId = (await createTeam(owner, "Acme")).id;
  memberRowId = (await inviteMember(owner, teamId, member.email)).member.id;
  await acceptInvite(member, inviteTokenFor(member.email));
});

describe("transferCredits", () => {
  it("moves credits owner -> member with paired ledger entries", async () => {
    const result = await transferCredits(owner, teamId, member.id, 30);
    expect(result).toMatchObject({ amount: 30, balance: 70, transferId: expect.stringMatching(/^xfer_/) });
    expect(await getBalance(owner.id)).toBe(70);
    expect(await getBalance(member.id)).toBe(35);

    const [out] = await ledgerOf(owner.id);
    const [inn] = await ledgerOf(member.id);
    expect(out).toMatchObject({
      delta: -30,
      balanceAfter: 70,
      reason: "transfer_out",
      idempotencyKey: `transfer:${result.transferId}:out`,
      note: "To Mia Member (Acme)",
    });
    expect(inn).toMatchObject({
      delta: 30,
      balanceAfter: 35,
      reason: "transfer_in",
      idempotencyKey: `transfer:${result.transferId}:in`,
      note: "From Olivia Owner (Acme)",
    });
  });

  it("never takes the owner below zero", async () => {
    expect(await code(transferCredits(owner, teamId, member.id, 101))).toBe("insufficient_credits");
    expect(await getBalance(owner.id)).toBe(100);
    expect(await getBalance(member.id)).toBe(5);
    expect(await ledgerOf(owner.id)).toHaveLength(0);
    expect(await ledgerOf(member.id)).toHaveLength(0);

    await transferCredits(owner, teamId, member.id, 100);
    expect(await getBalance(owner.id)).toBe(0);
  });

  it("is atomic: a failure after the debit rolls the debit back", async () => {
    ledgerControl.failTransferIn = true;
    await expect(transferCredits(owner, teamId, member.id, 40)).rejects.toThrow("simulated crash");
    expect(await getBalance(owner.id)).toBe(100);
    expect(await getBalance(member.id)).toBe(5);
    expect(await ledgerOf(owner.id)).toHaveLength(0);
    expect(await ledgerOf(member.id)).toHaveLength(0);
  });

  it("serializes concurrent transfers so the total never overdraws", async () => {
    const results = await Promise.allSettled([
      transferCredits(owner, teamId, member.id, 60),
      transferCredits(owner, teamId, member.id, 60),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await getBalance(owner.id)).toBe(40);
    expect(await getBalance(member.id)).toBe(65);
  });

  it("only the owner can transfer (members and admins can't)", async () => {
    expect(await code(transferCredits(member, teamId, owner.id, 1))).toBe("forbidden");
    await updateMemberRole(owner.id, teamId, memberRowId, "admin");
    expect(await code(transferCredits(member, teamId, owner.id, 1))).toBe("forbidden");
    expect(await getBalance(member.id)).toBe(5);
  });

  it("requires an active member of this team as the recipient", async () => {
    const stranger = await createTestUser();
    expect(await code(transferCredits(owner, teamId, stranger.id, 1))).toBe("not_found");

    const invited = await createTestUser();
    await inviteMember(owner, teamId, invited.email);
    expect(await code(transferCredits(owner, teamId, invited.id, 1))).toBe("not_found");

    await removeMember(owner.id, teamId, memberRowId);
    expect(await code(transferCredits(owner, teamId, member.id, 1))).toBe("not_found");
    expect(await getBalance(owner.id)).toBe(100);
  });

  it("can't target another team's members or be used by another team's owner (IDOR)", async () => {
    const otherOwner = await studioUser({ credits: 50 });
    const otherTeam = await createTeam(otherOwner, "Other");
    expect(await code(transferCredits(otherOwner, teamId, member.id, 1))).toBe("not_found");
    expect(await code(transferCredits(otherOwner, otherTeam.id, member.id, 1))).toBe("not_found");
    expect(await code(transferCredits(owner, otherTeam.id, member.id, 1))).toBe("not_found");
    expect(await getBalance(otherOwner.id)).toBe(50);
  });

  it.each([0, -5, 1.5, Number.NaN, 2_000_000])("rejects an invalid amount (%s)", async (amount) => {
    expect(await code(transferCredits(owner, teamId, member.id, amount))).toBe("validation_error");
  });

  it("rejects transferring to yourself", async () => {
    expect(await code(transferCredits(owner, teamId, owner.id, 5))).toBe("validation_error");
  });
});
