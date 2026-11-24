/** Owner -> member credit transfers: two ledger entries in one transaction. */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditLedger, teamMembers, user as userTable } from "@/db/schema";
import type { UserRow } from "@/db/types";
import { newId } from "@/lib/ids";
import { applyCredit } from "@/server/credits/ledger";
import { errors } from "@/server/http";
import { getTeamForOwner } from "./access";
import { MAX_TRANSFER_CREDITS } from "./schemas";
import type { CreditTransferResult } from "./types";

/**
 * Move `amount` credits from the team owner to an active member. Owner only. Both entries
 * (transfer_out + transfer_in) are written in ONE transaction with idempotency keys derived
 * from the transfer id, so either both apply or neither does. The owner's balance can never go
 * below zero (insufficient_credits). `opts.idempotencyKey` (the `Idempotency-Key` header) makes
 * retries safe. Transferred credits are not clawed back if the owner's purchase is later refunded
 * or charged back: the owner's balance goes negative instead (docs/KNOWN_ISSUES.md).
 */
export async function transferCredits(
  owner: UserRow,
  teamId: string,
  memberUserId: string,
  amount: number,
  opts?: { idempotencyKey?: string | null },
): Promise<CreditTransferResult> {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_TRANSFER_CREDITS) {
    throw errors.validation(`Transfer a whole number of credits between 1 and ${MAX_TRANSFER_CREDITS}.`);
  }
  const { team } = await getTeamForOwner(owner.id, teamId, "transfer credits");
  if (memberUserId === owner.id) throw errors.validation("You can't transfer credits to yourself.");

  // With an Idempotency-Key, a client / network retry is the same transfer (same ledger keys).
  const transferId = opts?.idempotencyKey
    ? `xfer_${createHash("sha256").update(`${owner.id}\n${opts.idempotencyKey}`).digest("hex").slice(0, 24)}`
    : newId("xfer");
  const balance = await db.transaction(async (tx) => {
    // Lock both accounts in a stable order so opposite-direction transfers can't deadlock.
    for (const id of [owner.id, memberUserId].sort()) {
      await tx.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, id)).for("update");
    }
    const [recipient] = await tx
      .select({ name: userTable.name, email: userTable.email })
      .from(teamMembers)
      .innerJoin(userTable, eq(userTable.id, teamMembers.userId))
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, memberUserId), eq(teamMembers.status, "active")),
      )
      .limit(1);
    if (!recipient) throw errors.notFound("Team member");

    const out = await applyCredit(
      {
        userId: owner.id,
        delta: -amount,
        reason: "transfer_out",
        idempotencyKey: `transfer:${transferId}:out`,
        note: `To ${recipient.name.trim() || recipient.email} (${team.name})`,
      },
      tx,
    );
    if (!out.applied) {
      // Replay of an Idempotency-Key: fine for the same transfer, a conflict for a different one.
      const [previous] = await tx
        .select({ userId: creditLedger.userId, delta: creditLedger.delta })
        .from(creditLedger)
        .where(eq(creditLedger.idempotencyKey, `transfer:${transferId}:in`))
        .limit(1);
      if (previous?.userId !== memberUserId || previous.delta !== amount) {
        throw errors.conflict("This Idempotency-Key was already used for a different transfer.");
      }
      return out.balance;
    }
    await applyCredit(
      {
        userId: memberUserId,
        delta: amount,
        reason: "transfer_in",
        idempotencyKey: `transfer:${transferId}:in`,
        note: `From ${owner.name.trim() || owner.email} (${team.name})`,
      },
      tx,
    );
    return out.balance;
  });

  return { transferId, amount, balance };
}
