import { APP } from "@/config/app";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { Callout, Paragraph, TextLink, Title } from "./_components/ui";

export default function AccountSuspendedEmail({ reason }: EmailTemplates["account_suspended"]) {
  return (
    <EmailLayout
      preview={`Your ${APP.name} account has been suspended.`}
      reason={`the status of your ${APP.name} account changed`}
    >
      <Title>Your account has been suspended</Title>
      <Paragraph>
        We&apos;ve suspended your {APP.name} account because of activity that appears to break our{" "}
        <TextLink href={`${APP.url}/legal/acceptable-use`}>Acceptable Use Policy</TextLink>.
      </Paragraph>
      <Callout label="Reason">{reason}</Callout>
      <Paragraph>While your account is suspended you can&apos;t sign in or create new content.</Paragraph>
      <Paragraph>
        If you think this is a mistake, contact {APP.supportEmail} and we&apos;ll review it.
      </Paragraph>
    </EmailLayout>
  );
}

AccountSuspendedEmail.PreviewProps = {
  reason: "Repeated attempts to generate images of a public figure.",
} satisfies EmailTemplates["account_suspended"];
