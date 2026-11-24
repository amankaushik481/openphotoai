import { APP } from "@/config/app";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { CtaButton, DetailList, Muted, Paragraph, Title } from "./_components/ui";

export default function ReceiptEmail({ name, description, amount, credits, url }: EmailTemplates["receipt"]) {
  return (
    <EmailLayout preview={`Payment received: ${description} (${amount}).`} reason={`you made a purchase on ${APP.name}`}>
      <Title>Thanks for your purchase</Title>
      <Paragraph>Hi {name || "there"}, your payment went through. Here are the details:</Paragraph>
      <DetailList
        rows={[
          ["Item", description],
          ["Amount", amount],
          ["Credits added", credits.toLocaleString("en-US")],
        ]}
      />
      <CtaButton href={url}>View billing</CtaButton>
      <Muted>
        Credits from packs never expire. Need an invoice or have a question about this charge? Contact{" "}
        {APP.supportEmail}.
      </Muted>
    </EmailLayout>
  );
}

ReceiptEmail.PreviewProps = {
  name: "Alex",
  description: "Pro plan (monthly)",
  amount: "$39.00",
  credits: 600,
  url: `${APP.url}/app/billing`,
} satisfies EmailTemplates["receipt"];
