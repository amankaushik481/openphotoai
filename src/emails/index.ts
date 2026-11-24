/**
 * Template registry: one React Email component + one subject line per template key.
 * (`pnpm email:dev` previews the components in this folder with their `PreviewProps`.)
 */
import type { ReactElement } from "react";
import { APP } from "@/config/app";
import type { EmailTemplateName, EmailTemplates } from "@/server/email";
import AccountSuspendedEmail from "./account-suspended";
import DeletionCompletedEmail from "./deletion-completed";
import DeletionConfirmRequestEmail from "./deletion-confirm-request";
import LowCreditsEmail from "./low-credits";
import MagicLinkEmail from "./magic-link";
import ModelDeletedEmail from "./model-deleted";
import ModelReadyEmail from "./model-ready";
import MultiPersonInviteEmail from "./multi-person-invite";
import ReceiptEmail from "./receipt";
import ReportReceivedEmail from "./report-received";
import TeamInviteEmail from "./team-invite";
import TrainingFailedEmail from "./training-failed";
import WelcomeEmail from "./welcome";

type EmailComponent<K extends EmailTemplateName> = ((props: EmailTemplates[K]) => ReactElement) & {
  PreviewProps: EmailTemplates[K];
};

export const EMAIL_COMPONENTS: { [K in EmailTemplateName]: EmailComponent<K> } = {
  magic_link: MagicLinkEmail,
  welcome: WelcomeEmail,
  model_ready: ModelReadyEmail,
  training_failed: TrainingFailedEmail,
  low_credits: LowCreditsEmail,
  receipt: ReceiptEmail,
  deletion_confirm_request: DeletionConfirmRequestEmail,
  deletion_completed: DeletionCompletedEmail,
  model_deleted: ModelDeletedEmail,
  multi_person_invite: MultiPersonInviteEmail,
  team_invite: TeamInviteEmail,
  account_suspended: AccountSuspendedEmail,
  report_received: ReportReceivedEmail,
};

/** User-provided values (model/team/inviter names) are clipped so subjects stay short and spam-resistant. */
const clip = (value: string, max = 60) => {
  const v = value.replace(/\s+/g, " ").trim();
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
};

export const EMAIL_SUBJECTS: { [K in EmailTemplateName]: (props: EmailTemplates[K]) => string } = {
  magic_link: () => `Your sign-in link for ${APP.name}`,
  welcome: () => `Welcome to ${APP.name}`,
  model_ready: (p) => `Your model "${clip(p.modelName)}" is ready`,
  training_failed: (p) => `Training didn't finish for "${clip(p.modelName)}"`,
  low_credits: (p) => `You have ${p.balance} ${p.balance === 1 ? "credit" : "credits"} left on ${APP.name}`,
  receipt: (p) => `Your ${APP.name} receipt: ${clip(p.description)}`,
  deletion_confirm_request: () => `Confirm your ${APP.name} account deletion`,
  deletion_completed: () => `Your ${APP.name} account has been deleted`,
  model_deleted: (p) => `Your model "${clip(p.modelName)}" was deleted`,
  multi_person_invite: (p) => `${clip(p.inviterName, 40)} invited you to create photos together on ${APP.name}`,
  team_invite: (p) => `${clip(p.inviterName, 40)} invited you to join ${clip(p.teamName, 40)} on ${APP.name}`,
  account_suspended: () => `Your ${APP.name} account has been suspended`,
  report_received: (p) => `We received your report (${p.reportId})`,
};
