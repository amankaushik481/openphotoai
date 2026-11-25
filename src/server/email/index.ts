/**
 * Transactional email. CONTRACT FILE (owner: email workstream).
 * Every email is rendered from a React Email template in src/emails/ and recorded in
 * email_outbox (status "mocked" when EMAIL_PROVIDER=mock; /dev/emails shows them).
 */
import { APP } from "@/config/app";
import { db } from "@/db";
import { emailOutbox } from "@/db/schema";
import { getEmailProvider } from "@/providers/registry";
import type { EmailProvider } from "@/providers/types";
import { AppError } from "@/server/http";
import type { EmailStatus } from "@/types/domain";
import { redactForStorage } from "./redact";
import { renderEmail } from "./render";

export interface EmailTemplates {
  magic_link: { url: string };
  welcome: { name: string };
  model_ready: { name: string; modelName: string; url: string };
  training_failed: { name: string; modelName: string; reason: string; url: string };
  low_credits: { name: string; balance: number; url: string };
  receipt: { name: string; description: string; amount: string; credits: number; url: string };
  deletion_confirm_request: { url: string; expiresInHours: number };
  deletion_completed: { summary: string };
  model_deleted: {
    modelName: string;
    /** What happened to the AI provider's copy of the trained weights (omitted = nothing to say). */
    providerCopy?: "none" | "deleted" | "not_deleted";
    /** Why the provider's copy wasn't deleted (e.g. "expires automatically within 24 hours"). */
    providerNote?: string;
  };
  multi_person_invite: { inviterName: string; message?: string | null; url: string };
  team_invite: { inviterName: string; teamName: string; url: string; /** How long the link works. */ expiresInDays?: number };
  account_suspended: { reason: string };
  report_received: { reportId: string };
}
export type EmailTemplateName = keyof EmailTemplates;

export { renderEmail, type RenderedEmail } from "./render";
export { extractLinks } from "./links";

/**
 * The user is actively waiting for these (sign-in, account deletion): a delivery failure must
 * surface to the caller. Every other template logs + records the failure and resolves.
 */
export const CRITICAL_EMAIL_TEMPLATES: ReadonlySet<EmailTemplateName> = new Set<EmailTemplateName>([
  "magic_link",
  "deletion_confirm_request",
]);

const MAX_ERROR_LENGTH = 1000;

function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, MAX_ERROR_LENGTH);
}

/** "jane.doe@example.com" -> "ja***@example.com" (keeps logs useful without full addresses). */
function maskEmail(address: string): string {
  const [local = "", domain = ""] = address.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

export interface SentEmail {
  /** email_outbox row id. */
  id: string;
  status: EmailStatus;
}

/**
 * Render + send + record in `email_outbox`. Returns the outbox row id and delivery status.
 * Throws (AppError "provider_error") only when a CRITICAL template fails to send.
 */
export async function sendEmail<T extends EmailTemplateName>(
  template: T,
  to: string,
  props: EmailTemplates[T],
  opts?: { userId?: string },
): Promise<SentEmail> {
  const recipient = to.trim();
  const rendered = await renderEmail(template, props);

  let provider: EmailProvider | undefined;
  let status: EmailStatus = "failed";
  let providerMessageId: string | null = null;
  let error: string | null = null;
  // RFC 2606 reserves ".invalid": never deliverable (used for demo accounts) — record, don't send.
  const undeliverable = /\.invalid$/i.test(recipient);
  try {
    provider = getEmailProvider();
    if (undeliverable) {
      status = "mocked";
      throw new SkipDelivery();
    }
    const result = await provider.send({
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: APP.supportEmail,
      tags: { template },
    });
    providerMessageId = result.id;
    status = provider.name === "mock" ? "mocked" : "sent";
  } catch (err) {
    if (!(err instanceof SkipDelivery)) error = errorMessage(err);
  }

  const stored = provider?.name === "mock" ? rendered : redactForStorage(template, props, rendered);
  const [row] = await db
    .insert(emailOutbox)
    .values({
      userId: opts?.userId ?? null,
      to: recipient,
      subject: stored.subject,
      template,
      html: stored.html,
      text: stored.text,
      status,
      providerMessageId,
      error,
    })
    .returning({ id: emailOutbox.id });

  if (status === "failed") {
    console.error(`[email] ${template} to ${maskEmail(recipient)} failed: ${error}`);
    if (CRITICAL_EMAIL_TEMPLATES.has(template)) {
      throw new AppError("provider_error", "We couldn't send the email. Please try again in a minute.");
    }
  }
  return { id: row!.id, status };
}

/**
 * Fire-and-forget variant: never throws (render, provider and database errors are logged).
 * Resolves like sendEmail, or to null when a critical send failed or nothing could be recorded.
 */
export async function sendEmailSafe<T extends EmailTemplateName>(
  template: T,
  to: string,
  props: EmailTemplates[T],
  opts?: { userId?: string },
): Promise<SentEmail | null> {
  try {
    return await sendEmail(template, to, props, opts);
  } catch (err) {
    console.error(`[email] ${template} to ${maskEmail(to)} could not be sent:`, err);
    return null;
  }
}

class SkipDelivery extends Error {}
