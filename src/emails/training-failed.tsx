import { APP } from "@/config/app";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { Callout, CtaButton, Muted, Paragraph, Title } from "./_components/ui";

export default function TrainingFailedEmail({ name, modelName, reason, url }: EmailTemplates["training_failed"]) {
  return (
    <EmailLayout
      preview={`We couldn't finish training ${modelName}. Your credits were refunded.`}
      reason={`you started training a model on ${APP.name}`}
    >
      <Title>Training didn&apos;t finish</Title>
      <Paragraph>
        Hi {name || "there"}, we couldn&apos;t finish training <strong>{modelName}</strong>.
      </Paragraph>
      <Callout label="What went wrong">{reason}</Callout>
      <Paragraph>The credits for this training were refunded to your balance automatically.</Paragraph>
      <Paragraph>Most failures are temporary. Review your photos and start training again when you&apos;re ready.</Paragraph>
      <CtaButton href={url}>Review and retry</CtaButton>
      <Muted>Still stuck? Email {APP.supportEmail} with the model name and we&apos;ll take a look.</Muted>
    </EmailLayout>
  );
}

TrainingFailedEmail.PreviewProps = {
  name: "Alex",
  modelName: "Alex (work)",
  reason: "The training provider timed out.",
  url: `${APP.url}/app/models/mdl_preview`,
} satisfies EmailTemplates["training_failed"];
