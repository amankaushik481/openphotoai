import { APP } from "@/config/app";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { Callout, CtaButton, LinkFallback, Muted, Paragraph, Title } from "./_components/ui";

export default function MultiPersonInviteEmail({ inviterName, message, url }: EmailTemplates["multi_person_invite"]) {
  const note = message?.trim();
  return (
    <EmailLayout
      preview={`${inviterName} would like to create photos of the two of you together.`}
      reason={`${inviterName} invited this email address on ${APP.name}`}
    >
      <Title>{inviterName} invited you to take photos together</Title>
      <Paragraph>
        {inviterName} would like to create AI photos that include both of you, using {APP.name}.
      </Paragraph>
      {note ? <Callout label={`Message from ${inviterName}`}>{note}</Callout> : null}
      <Paragraph>
        Nothing is shared unless you accept. If you do, you choose which of your own models to share, and either of you
        can revoke access at any time.
      </Paragraph>
      <CtaButton href={url}>View invitation</CtaButton>
      <LinkFallback href={url} />
      <Muted>
        Don&apos;t know {inviterName}? Ignore this email and the invitation will expire. To report misuse, contact{" "}
        {APP.takedownEmail}.
      </Muted>
    </EmailLayout>
  );
}

MultiPersonInviteEmail.PreviewProps = {
  inviterName: "Sam",
  message: "Want to make some fun photos for the wedding website?",
  url: `${APP.url}/invites/preview-token`,
} satisfies EmailTemplates["multi_person_invite"];
