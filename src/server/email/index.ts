/**
 * Transactional email. CONTRACT FILE (owner: email workstream).
 * Every email is rendered from a React Email template in src/emails/ and recorded in
 * email_outbox (status "mocked" when EMAIL_PROVIDER=mock; /dev/emails shows them).
 */
export interface EmailTemplates {
  magic_link: { url: string };
  welcome: { name: string };
  model_ready: { name: string; modelName: string; url: string };
  training_failed: { name: string; modelName: string; reason: string; url: string };
  low_credits: { name: string; balance: number; url: string };
  receipt: { name: string; description: string; amount: string; credits: number; url: string };
  deletion_confirm_request: { url: string; expiresInHours: number };
  deletion_completed: { summary: string };
  model_deleted: { modelName: string };
  multi_person_invite: { inviterName: string; message?: string | null; url: string };
  team_invite: { inviterName: string; teamName: string; url: string };
  account_suspended: { reason: string };
  report_received: { reportId: string };
}
export type EmailTemplateName = keyof EmailTemplates;

export async function sendEmail<T extends EmailTemplateName>(
  template: T,
  to: string,
  props: EmailTemplates[T],
  opts?: { userId?: string },
): Promise<{ id: string }> {
  void template;
  void to;
  void props;
  void opts;
  throw new Error("not implemented: sendEmail (email workstream)");
}
