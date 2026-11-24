import { APP } from "@/config/app";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { Muted, Paragraph, Title } from "./_components/ui";

export default function ModelDeletedEmail({ modelName }: EmailTemplates["model_deleted"]) {
  return (
    <EmailLayout preview={`${modelName} and its training data were permanently deleted.`} reason={`you deleted a model on ${APP.name}`}>
      <Title>Model deleted</Title>
      <Paragraph>
        <strong>{modelName}</strong> has been permanently deleted, together with its training photos, consent selfie
        and trained model files, including the copies held by our AI providers.
      </Paragraph>
      <Paragraph>Photos and videos you already created stay in your gallery until you delete them.</Paragraph>
      <Muted>Didn&apos;t delete this model? Contact {APP.supportEmail} right away.</Muted>
    </EmailLayout>
  );
}

ModelDeletedEmail.PreviewProps = { modelName: "Alex (work)" } satisfies EmailTemplates["model_deleted"];
