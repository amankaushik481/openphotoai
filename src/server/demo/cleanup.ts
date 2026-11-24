/**
 * Maintenance step: delete demo accounts older than DEMO_ACCOUNT_TTL_HOURS through the regular
 * account deletion (models, storage, rows). Idempotent: an account whose deletion stopped part-way
 * still has its user row and is simply picked up again on the next run. Runs whether or not
 * DEMO_MODE is still on, so turning demo mode off doesn't strand old demo data.
 */
import { and, asc, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { deleteAccountCompletely } from "@/server/account";
import { DEMO_ACCOUNT_TTL_HOURS, DEMO_EMAIL_DOMAIN } from "./constants";

/** Accounts deleted per maintenance run (each one walks storage and every owned row). */
export const DEMO_CLEANUP_BATCH = 25;

const HOUR_MS = 3_600_000;
const SUFFIX = `@${DEMO_EMAIL_DOMAIN}`;

/** Ids of expired demo accounts, oldest first. */
export async function findExpiredDemoUsers(now: Date, limit = DEMO_CLEANUP_BATCH): Promise<string[]> {
  const cutoff = new Date(now.getTime() - DEMO_ACCOUNT_TTL_HOURS * HOUR_MS);
  const rows = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(and(sql`right(${userTable.email}, ${SUFFIX.length}) = ${SUFFIX}`, lt(userTable.createdAt, cutoff)))
    .orderBy(asc(userTable.createdAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

/** Delete up to `limit` expired demo accounts. Returns how many were fully deleted. */
export async function deleteExpiredDemoUsers(now: Date = new Date(), limit = DEMO_CLEANUP_BATCH): Promise<number> {
  let deleted = 0;
  for (const userId of await findExpiredDemoUsers(now, limit)) {
    // Never throws: a failed step is in the report and the account is retried next run.
    const report = await deleteAccountCompletely(userId);
    if (report.error) console.error(`[demo] deleting expired demo account ${userId} stopped: ${report.error}`);
    else deleted++;
  }
  return deleted;
}
