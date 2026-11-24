import { APP } from "@/config/app";
import type { EmailTemplates } from "@/server/email";
import { EmailLayout } from "./_components/layout";
import { DetailList, Muted, Paragraph, Title } from "./_components/ui";

export default function ReportReceivedEmail({ reportId }: EmailTemplates["report_received"]) {
  return (
    <EmailLayout
      preview={`We received your report and will review it.`}
      reason={`you reported content on ${APP.name}`}
    >
      <Title>Thanks, we received your report</Title>
      <Paragraph>
        Our team will review it and take action if the content breaks our rules. We treat reports about
        non-consensual or harmful content as a priority.
      </Paragraph>
      <DetailList rows={[["Reference", reportId]]} />
      <Muted>
        To add information, email {APP.takedownEmail} and include your reference number.
      </Muted>
    </EmailLayout>
  );
}

ReportReceivedEmail.PreviewProps = { reportId: "rpt_preview123" } satisfies EmailTemplates["report_received"];
