import { APP } from "@/config/app";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { CtaButton, LinkFallback, Muted, Paragraph, Title } from "./_components/ui";

export default function TeamInviteEmail({ inviterName, teamName, url, expiresInDays }: EmailTemplates["team_invite"]) {
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
        consistent headshots and can receive credits from the team owner. Your own photos, models and selfies stay
        private.
      </Paragraph>
      <CtaButton href={url}>Accept invitation</CtaButton>
      <LinkFallback href={url} />
      <Muted>
        Sign in with this email address to join
        {expiresInDays ? `. The link works for ${expiresInDays} ${expiresInDays === 1 ? "day" : "days"}` : ""}. If you
        weren&apos;t expecting this invitation, you can ignore this email.
      </Muted>
    </EmailLayout>
  );
}

TeamInviteEmail.PreviewProps = {
  inviterName: "Sam",
  teamName: "Acme Marketing",
  url: `${APP.url}/teams/join/preview-token`,
  expiresInDays: 14,
} satisfies EmailTemplates["team_invite"];
