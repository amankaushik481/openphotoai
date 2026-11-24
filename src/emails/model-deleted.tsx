import { APP } from "@/config/app";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { Muted, Paragraph, Title } from "./_components/ui";

export default function ModelDeletedEmail({ modelName, providerCopy, providerNote }: EmailTemplates["model_deleted"]) {
  return (
    <EmailLayout preview={`${modelName} and its training data were permanently deleted.`} reason={`you deleted a model on ${APP.name}`}>
      <Title>Model deleted</Title>
      <Paragraph>
        <strong>{modelName}</strong> has been permanently deleted, together with its training photos, consent selfie
        and the trained model files we store.
        {providerCopy === "deleted" && " The copy held by our AI provider was deleted too."}
      </Paragraph>
      {providerCopy === "not_deleted" && (
        <Paragraph>
          Our AI provider&apos;s copy of the trained model files could not be deleted right away
          {providerNote ? ` (${providerNote})` : ""}. We no longer use or link to it.
        </Paragraph>
      )}
      <Paragraph>Photos and videos you already created stay in your gallery until you delete them.</Paragraph>
      <Muted>Didn&apos;t delete this model? Contact {APP.supportEmail} right away.</Muted>
    </EmailLayout>
  );
}

ModelDeletedEmail.PreviewProps = { modelName: "Alex (work)" } satisfies EmailTemplates["model_deleted"];
