/**
 * Mock email provider: delivers nothing. `sendEmail()` records every message in
 * `email_outbox` (status "mocked"), which the dev mailbox at /dev/emails displays.
 */
import { APP } from "@/config/app";
import { newId } from "@/lib/ids";
import type { EmailMessage, EmailProvider } from "@/providers/types";

export function createMockEmailProvider(): EmailProvider {
  return {
    name: "mock",
    async send(msg: EmailMessage) {
      const id = newId("mock");
      // One line, never the body: emails carry sign-in and deletion links.
      if (process.env.NODE_ENV !== "test") {
        console.info(`[email:mock] to=${msg.to} subject=${JSON.stringify(msg.subject)} id=${id} (view at ${APP.url}/dev/emails)`);
      }
      return { id };
    },
  };
}
