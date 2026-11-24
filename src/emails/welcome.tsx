import { APP, TRAINING } from "@/config/app";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { CtaButton, Muted, Paragraph, Title } from "./_components/ui";

export default function WelcomeEmail({ name }: EmailTemplates["welcome"]) {
  const greeting = name.trim() ? `Welcome, ${name.trim()}!` : `Welcome to ${APP.name}!`;
  return (
    <EmailLayout preview={`Create your private AI model and get your first photos in minutes.`} reason={`you created a ${APP.name} account`}>
      <Title>{greeting}</Title>
      <Paragraph>{APP.name} is your private AI photographer. Getting your first photos takes three steps:</Paragraph>
      <Paragraph>
        <strong>1. Create your model.</strong> Take a quick live selfie so we know it&apos;s really you, then upload{" "}
        {TRAINING.minPhotos}–{TRAINING.maxPhotos} photos of yourself.
        <br />
        <strong>2. Go instant or train.</strong> Instant models are ready in seconds; trained models give the best
        likeness.
        <br />
        <strong>3. Create.</strong> Pick a photo pack or describe the shot you want.
      </Paragraph>
      <CtaButton href={`${APP.url}/app/models/new`}>Create your model</CtaButton>
      <Muted>
        Your photos stay private. You can delete your training photos, models or your whole account at any time from
        Settings.
      </Muted>
    </EmailLayout>
  );
}

WelcomeEmail.PreviewProps = { name: "Alex" } satisfies EmailTemplates["welcome"];
