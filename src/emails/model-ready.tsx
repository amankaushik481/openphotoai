import { APP } from "@/config/app";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { CtaButton, Paragraph, Title } from "./_components/ui";

export default function ModelReadyEmail({ name, modelName, url }: EmailTemplates["model_ready"]) {
  return (
    <EmailLayout preview={`${modelName} finished training. Start creating photos.`} reason={`you trained a model on ${APP.name}`}>
      <Title>Your model is ready</Title>
      <Paragraph>
        Hi {name || "there"}, good news: <strong>{modelName}</strong> finished training and is ready to use.
      </Paragraph>
      <Paragraph>Start with a photo pack for lots of looks at once, or describe exactly the shot you want.</Paragraph>
      <CtaButton href={url}>Create photos</CtaButton>
    </EmailLayout>
  );
}

ModelReadyEmail.PreviewProps = {
  name: "Alex",
  modelName: "Alex (work)",
  url: `${APP.url}/app/create?model=mdl_preview`,
} satisfies EmailTemplates["model_ready"];
