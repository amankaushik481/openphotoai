/**
 * Shared mocks for team tests:
 *   vi.mock("@/server/email", async () => (await import("./fixtures")).emailModuleMock);
 *   vi.mock("@/server/safety", async () => (await import("./fixtures")).safetyModuleMock);
 */
import { vi } from "vitest";
import type { UserRow } from "@/db/types";
import type { EmailTemplateName, EmailTemplates } from "@/server/email";
import { errors } from "@/server/http";
import { createTestUser } from "../../helpers/db";

export interface SentTestEmail {
  template: EmailTemplateName;
  to: string;
  props: EmailTemplates[EmailTemplateName];
}

export const sentEmails: SentTestEmail[] = [];

export const emailModuleMock = {
  sendEmail: vi.fn(async (template: EmailTemplateName, to: string, props: EmailTemplates[EmailTemplateName]) => {
    sentEmails.push({ template, to, props });
    return { id: `eml_${sentEmails.length}`, status: "mocked" as const };
  }),
};

/** Any text containing this marker is "blocked" by the mocked safety gate. */
export const BLOCKED_TEXT = "forbidden-content";

export const safetyModuleMock = {
  assertTextAllowed: vi.fn(async (texts: string[]) => {
    if (texts.some((t) => t.includes(BLOCKED_TEXT))) throw errors.contentBlocked();
  }),
};

export function resetTeamMocks(): void {
  sentEmails.length = 0;
  emailModuleMock.sendEmail.mockClear();
  safetyModuleMock.assertTextAllowed.mockClear();
}

/** Token from the join URL of the most recent invite email to `to`. */
export function inviteTokenFor(to: string): string {
  const email = [...sentEmails].reverse().find((e) => e.template === "team_invite" && e.to === to);
  if (!email) throw new Error(`no team invite sent to ${to}`);
  const url = (email.props as EmailTemplates["team_invite"]).url;
  const match = url.match(/\/teams\/join\/([^/?#]+)$/);
  if (!match) throw new Error(`unexpected invite url ${url}`);
  return decodeURIComponent(match[1]!);
}

export function studioUser(overrides: Parameters<typeof createTestUser>[0] = {}): Promise<UserRow> {
  return createTestUser({ plan: "studio", hasPaid: true, name: "Olivia Owner", ...overrides });
}
