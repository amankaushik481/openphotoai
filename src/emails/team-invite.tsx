import { APP } from "@/config/app";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { CtaButton, LinkFallback, Muted, Paragraph, Title } from "./_components/ui";

export default function TeamInviteEmail({ inviterName, teamName, url }: EmailTemplates["team_invite"]) {
  return (
    <EmailLayout
      preview={`${inviterName} invited you to join ${teamName} on ${APP.name}.`}
      reason={`${inviterName} invited this email address to a team on ${APP.name}`}
    >
      <Title>
        Join {teamName} on {APP.name}
      </Title>
      <Paragraph>
        {inviterName} invited you to join the team <strong>{teamName}</strong>. Team members use shared brand kits for
        consistent headshots and can receive credits from the team owner.
      </Paragraph>
      <CtaButton href={url}>Accept invitation</CtaButton>
      <LinkFallback href={url} />
      <Muted>If you weren&apos;t expecting this invitation, you can ignore this email.</Muted>
    </EmailLayout>
  );
}

TeamInviteEmail.PreviewProps = {
  inviterName: "Sam",
  teamName: "Acme Marketing",
  url: `${APP.url}/teams/join/preview-token`,
} satisfies EmailTemplates["team_invite"];
