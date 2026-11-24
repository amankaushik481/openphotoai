/**
 * Some emails carry single-use secrets in their URL (sign-in, deletion, invite tokens). Those
 * tokens are stored hashed elsewhere, so the outbox copy of a REAL delivery must not keep them in
 * clear text. Mock deliveries keep them: the dev mailbox exists to show those links.
 */
import type { EmailTemplateName, EmailTemplates } from "./index";
import type { RenderedEmail } from "./render";

export const REDACTED = "[redacted]";

const SECRET_URL_TEMPLATES = new Set<EmailTemplateName>([
  "magic_link",
  "deletion_confirm_request",
  "multi_person_invite",
  "team_invite",
]);

/** React's HTML escaping (attribute values and text). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function replaceAllOf(content: string, secret: string): string {
  return content.split(secret).join(REDACTED).split(escapeHtml(secret)).join(REDACTED);
}

export function redactForStorage<T extends EmailTemplateName>(
  template: T,
  props: EmailTemplates[T],
  rendered: RenderedEmail,
): RenderedEmail {
  if (!SECRET_URL_TEMPLATES.has(template)) return rendered;
  const url = (props as { url?: unknown }).url;
  if (typeof url !== "string" || url.length === 0) return rendered;
  return {
    subject: rendered.subject,
    html: replaceAllOf(rendered.html, url),
    text: replaceAllOf(rendered.text, url),
  };
}
