/** Row factories for admin tests (payments, subscriptions, sessions, share links, reports, events). */
import { db } from "@/db";
import * as schema from "@/db/schema";
import { newId, newToken } from "@/lib/ids";

export async function createPayment(userId: string, overrides: Partial<typeof schema.payments.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.payments)
    .values({
      provider: "mock",
      providerPaymentId: newId("chk"),
      kind: "credit_pack",
      productId: "credits_100",
      amountCents: 900,
      credits: 100,
      status: "paid",
      ...overrides,
      userId,
    })
    .returning();
  return row!;
}

export async function createSubscription(
  userId: string,
  overrides: Partial<typeof schema.subscriptions.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.subscriptions)
    .values({
      provider: "mock",
      providerSubscriptionId: newId("sub_ext"),
      planId: "pro",
      interval: "month",
      status: "active",
      lastEventAt: new Date(),
      ...overrides,
      userId,
    })
    .returning();
  return row!;
}

export async function createSession(userId: string) {
  const [row] = await db
    .insert(schema.session)
    .values({ id: newId("ses"), token: newToken(), expiresAt: new Date(Date.now() + 86_400_000), userId })
    .returning();
  return row!;
}

export async function createShareLink(userId: string, overrides: Partial<typeof schema.shareLinks.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.shareLinks)
    .values({ token: newToken(), ...overrides, userId })
    .returning();
  return row!;
}

export async function createReport(overrides: Partial<typeof schema.reports.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.reports)
    .values({ reason: "non_consensual", details: "This is me and I never agreed.", ...overrides })
    .returning();
  return row!;
}

export async function createModerationEvent(overrides: Partial<typeof schema.moderationEvents.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.moderationEvents)
    .values({ kind: "prompt_blocked", details: { excerpt: "blocked prompt" }, ...overrides })
    .returning();
  return row!;
}
