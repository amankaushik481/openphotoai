import { APP } from "@/config/app";
import { CREDIT_COSTS } from "@/config/credits";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { CtaButton, Muted, Paragraph, Title } from "./_components/ui";

const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;

export default function LowCreditsEmail({ name, balance, url }: EmailTemplates["low_credits"]) {
  return (
    <EmailLayout
      preview={`You have ${credits(balance)} left. Top up to keep creating.`}
      reason={`you have a ${APP.name} account and created photos recently`}
    >
      <Title>You&apos;re running low on credits</Title>
      <Paragraph>
        Hi {name || "there"}, you have <strong>{credits(balance)}</strong> left. A standard photo costs{" "}
        {credits(CREDIT_COSTS.generateStandard)} and a 5-second video {credits(CREDIT_COSTS.video5s)}.
      </Paragraph>
      <Paragraph>Top up whenever you like: credits from packs never expire.</Paragraph>
      <CtaButton href={url}>Get more credits</CtaButton>
      <Muted>We send this reminder at most once every two weeks.</Muted>
    </EmailLayout>
  );
}

LowCreditsEmail.PreviewProps = { name: "Alex", balance: 4, url: `${APP.url}/app/billing` } satisfies EmailTemplates["low_credits"];
