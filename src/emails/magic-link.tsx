import { APP } from "@/config/app";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { CtaButton, LinkFallback, Muted, Paragraph, Title } from "./_components/ui";

export default function MagicLinkEmail({ url }: EmailTemplates["magic_link"]) {
  return (
    <EmailLayout
      preview={`Your one-click sign-in link for ${APP.name}.`}
      reason="someone (hopefully you) asked to sign in with this email address"
    >
      <Title>Sign in to {APP.name}</Title>
      <Paragraph>Click the button below to sign in. The link works once and expires shortly.</Paragraph>
      <CtaButton href={url}>Sign in</CtaButton>
      <LinkFallback href={url} />
      <Muted>
        Didn&apos;t ask for this? You can safely ignore this email. Nobody can sign in without this link, so please
        don&apos;t forward it.
      </Muted>
    </EmailLayout>
  );
}

MagicLinkEmail.PreviewProps = {
  url: `${APP.url}/api/auth/magic-link/verify?token=preview-token&callbackURL=%2Fapp`,
} satisfies EmailTemplates["magic_link"];
