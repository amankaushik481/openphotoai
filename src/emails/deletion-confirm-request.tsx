import { APP } from "@/config/app";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { CtaButton, LinkFallback, Muted, Paragraph, Title } from "./_components/ui";

export default function DeletionConfirmRequestEmail({ url, expiresInHours }: EmailTemplates["deletion_confirm_request"]) {
  const hours = `${expiresInHours} ${expiresInHours === 1 ? "hour" : "hours"}`;
  return (
    <EmailLayout
      preview={`Confirm that you want to permanently delete your ${APP.name} account.`}
      reason={`someone asked to delete the ${APP.name} account linked to this email address`}
    >
      <Title>Confirm account deletion</Title>
      <Paragraph>We received a request to permanently delete your {APP.name} account.</Paragraph>
      <Paragraph>
        Deleting your account removes your photos, videos, identity models, training selfies and all other personal
        data from our storage and from our AI providers. <strong>This can&apos;t be undone.</strong>
      </Paragraph>
      <CtaButton href={url} tone="danger">
        Delete my account
      </CtaButton>
      <LinkFallback href={url} />
      <Muted>
        This link expires in {hours}. If you didn&apos;t ask to delete your account, ignore this email and nothing will
        happen. You may also want to let us know at {APP.supportEmail}.
      </Muted>
    </EmailLayout>
  );
}

DeletionConfirmRequestEmail.PreviewProps = {
  url: `${APP.url}/account/delete/confirm?token=preview-token`,
  expiresInHours: 24,
} satisfies EmailTemplates["deletion_confirm_request"];
