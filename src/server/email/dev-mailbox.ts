/**
 * Dev mailbox: read access to mocked emails for /dev/emails and /api/dev/emails/latest.
 * These rows contain live sign-in links, so every function refuses to run unless the
 * mailbox is enabled (callers should check `isDevMailboxEnabled()` first and 404).
 */
import { and, desc, eq, notInArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { emailOutbox, user as userTable } from "@/db/schema";
import { env } from "@/lib/env";
import { errors } from "@/server/http";
import type { EmailStatus } from "@/types/domain";
import type { EmailTemplateName } from "./index";
import { extractLinks } from "./links";

/**
 * True only while the mock email provider is active. In production the mailbox additionally
 * requires an all-mock deployment (mock AI, payments and email: a demo) and an explicit mock
 * choice (MOCK_PROVIDERS=true or EMAIL_PROVIDER=mock): a deployment that merely forgot
 * RESEND_API_KEY, or that runs real AI/payments, must never expose sign-in links.
 * The rule lives in src/lib/env.ts (`devMailboxEnabled`).
 */
export function isDevMailboxEnabled(): boolean {
  return env.devMailboxEnabled;
}

function assertEnabled(): void {
  if (!isDevMailboxEnabled()) throw errors.notFound("Page");
}

/**
 * Rows the mailbox may show. In production (an all-mock demo deployment) the mailbox is public, so
 * anyone could read a magic link: mail to an admin (ADMIN_EMAILS, or any account with the admin role)
 * is never shown there. Admins of such a deployment sign in with Google or a real email provider.
 */
function visibleRows(): SQL | undefined {
  if (!env.isProd) return undefined;
  const admins = env.ADMIN_EMAILS;
  return and(
    admins.length ? notInArray(sql`lower(${emailOutbox.to})`, admins) : undefined,
    sql`lower(${emailOutbox.to}) not in (select lower(${userTable.email}) from ${userTable} where ${userTable.role} = 'admin')`,
  );
}

export interface DevEmailSummary {
  id: string;
  to: string;
  subject: string;
  template: string;
  status: EmailStatus;
  createdAt: Date;
}

export interface DevEmail extends DevEmailSummary {
  userId: string | null;
  html: string;
  text: string;
  providerMessageId: string | null;
  error: string | null;
  links: string[];
}

const summaryColumns = {
  id: emailOutbox.id,
  to: emailOutbox.to,
  subject: emailOutbox.subject,
  template: emailOutbox.template,
  status: emailOutbox.status,
  createdAt: emailOutbox.createdAt,
};

function toDevEmail(row: typeof emailOutbox.$inferSelect): DevEmail {
  return {
    id: row.id,
    userId: row.userId,
    to: row.to,
    subject: row.subject,
    template: row.template,
    status: row.status,
    createdAt: row.createdAt,
    html: row.html,
    text: row.text ?? "",
    providerMessageId: row.providerMessageId,
    error: row.error,
    links: extractLinks(row.html),
  };
}

/** Newest first. */
export async function listDevEmails(limit = 100): Promise<DevEmailSummary[]> {
  assertEnabled();
  return db
    .select(summaryColumns)
    .from(emailOutbox)
    .where(visibleRows())
    .orderBy(desc(emailOutbox.createdAt), desc(emailOutbox.id))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function getDevEmail(id: string): Promise<DevEmail | null> {
  assertEnabled();
  const [row] = await db.select().from(emailOutbox).where(and(eq(emailOutbox.id, id), visibleRows())).limit(1);
  return row ? toDevEmail(row) : null;
}

/** Newest email to an address (case-insensitive), optionally of one template. */
export async function getLatestDevEmail(filter: { to: string; template?: EmailTemplateName }): Promise<DevEmail | null> {
  assertEnabled();
  const recipient = filter.to.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(emailOutbox)
    .where(
      and(
        sql`lower(${emailOutbox.to}) = ${recipient}`,
        filter.template ? eq(emailOutbox.template, filter.template) : undefined,
        visibleRows(),
      ),
    )
    .orderBy(desc(emailOutbox.createdAt), desc(emailOutbox.id))
    .limit(1);
  return row ? toDevEmail(row) : null;
}
