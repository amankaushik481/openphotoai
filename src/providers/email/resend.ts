/**
 * Resend (https://resend.com) email provider. The SDK is imported lazily on first send
 * so constructing the provider stays cheap.
 */
import type { Resend } from "resend";
import type { EmailMessage, EmailProvider } from "@/providers/types";

/** Resend tag names/values allow only ASCII letters, numbers, underscores and dashes (max 256 chars). */
function toTagPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
}

export function createResendEmailProvider(opts: { apiKey: string; from: string }): EmailProvider {
  let client: Promise<Resend> | undefined;
  const getClient = () => (client ??= import("resend").then(({ Resend }) => new Resend(opts.apiKey)));

  return {
    name: "resend",
    async send(msg: EmailMessage) {
      const resend = await getClient();
      let result: Awaited<ReturnType<Resend["emails"]["send"]>>;
      try {
        result = await resend.emails.send({
          from: opts.from,
          to: msg.to,
          subject: msg.subject,
          html: msg.html,
          ...(msg.text ? { text: msg.text } : {}),
          ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
          ...(msg.tags
            ? { tags: Object.entries(msg.tags).map(([name, value]) => ({ name: toTagPart(name), value: toTagPart(value) })) }
            : {}),
        });
      } catch (err) {
        throw new Error(`Resend request failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
      }
      if (result.error) {
        const status = result.error.statusCode ? ` (${result.error.statusCode})` : "";
        throw new Error(`Resend ${result.error.name}${status}: ${result.error.message}`);
      }
      if (!result.data?.id) throw new Error("Resend returned no message id.");
      return { id: result.data.id };
    },
  };
}
