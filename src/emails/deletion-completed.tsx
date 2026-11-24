import { APP } from "@/config/app";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { Callout, Muted, Paragraph, Title } from "./_components/ui";

export default function DeletionCompletedEmail({ summary }: EmailTemplates["deletion_completed"]) {
  return (
    <EmailLayout
      preview={`Your ${APP.name} account and its data have been permanently deleted.`}
      reason={`you deleted your ${APP.name} account. This is the last email we'll send you`}
    >
      <Title>Your account has been deleted</Title>
      <Paragraph>As you requested, we&apos;ve permanently deleted your {APP.name} account and its data.</Paragraph>
      <Callout label="What we deleted">{summary}</Callout>
      <Muted>Billing records held by our payment processor may be kept where the law requires it.</Muted>
      <Paragraph>Thanks for trying {APP.name}. You&apos;re welcome back any time.</Paragraph>
    </EmailLayout>
  );
}

DeletionCompletedEmail.PreviewProps = {
  summary: "3 identity models, 42 training photos, 318 photos and videos, 1 consent selfie.",
} satisfies EmailTemplates["deletion_completed"];
