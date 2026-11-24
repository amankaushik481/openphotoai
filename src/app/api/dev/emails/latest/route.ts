/**
 * GET /api/dev/emails/latest?to=<email>[&template=<name>] — newest mocked email to an address.
 * Mock email provider only (404 otherwise). Used by Playwright to follow magic links.
 */
import { z } from "zod";
import { EMAIL_COMPONENTS } from "@/emails";
import type { EmailTemplateName } from "@/server/email";
import { getLatestDevEmail, isDevMailboxEnabled } from "@/server/email/dev-mailbox";
import { errors, parseQuery, route } from "@/server/http";

const templateNames = Object.keys(EMAIL_COMPONENTS) as [EmailTemplateName, ...EmailTemplateName[]];

const query = z.object({
  to: z.string().trim().min(3).max(320),
  template: z.enum(templateNames).optional(),
});

export const GET = route({ auth: "public" }, async ({ req }) => {
  if (!isDevMailboxEnabled()) throw errors.notFound("Page");
  const { to, template } = parseQuery(req, query);
  const email = await getLatestDevEmail({ to, template });
  if (!email) throw errors.notFound("Email");
  return {
    id: email.id,
    to: email.to,
    template: email.template,
    subject: email.subject,
    html: email.html,
    text: email.text,
    links: email.links,
    createdAt: email.createdAt.toISOString(),
  };
});
