/**
 * Dev mailbox: read access to mocked emails for /dev/emails and /api/dev/emails/latest.
 * These rows contain live sign-in links, so every function refuses to run unless the
 * mailbox is enabled (callers should check `isDevMailboxEnabled()` first and 404).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailOutbox } from "@/db/schema";
import { env } from "@/lib/env";
import { errors } from "@/server/http";
import type { EmailStatus } from "@/types/domain";
import type { EmailTemplateName } from "./index";
import { extractLinks } from "./links";

/**
 * True only while the mock email provider is active. In production the mailbox additionally
 * requires an explicit mock choice (MOCK_PROVIDERS=true or EMAIL_PROVIDER=mock): a deployment that
 * merely forgot RESEND_API_KEY falls back to mock delivery but must never expose sign-in links.
 */
export function isDevMailboxEnabled(): boolean {
  if (env.emailProvider !== "mock") return false;
  if (env.isProd && !env.MOCK_PROVIDERS && env.EMAIL_PROVIDER !== "mock") return false;
  return true;
}

function assertEnabled(): void {
  if (!isDevMailboxEnabled()) throw errors.notFound("Page");
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
    .orderBy(desc(emailOutbox.createdAt), desc(emailOutbox.id))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function getDevEmail(id: string): Promise<DevEmail | null> {
  assertEnabled();
  const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id)).limit(1);
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
      ),
    )
    .orderBy(desc(emailOutbox.createdAt), desc(emailOutbox.id))
    .limit(1);
  return row ? toDevEmail(row) : null;
}
