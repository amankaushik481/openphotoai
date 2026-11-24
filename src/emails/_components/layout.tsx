import { Body, Container, Head, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { APP } from "@/config/app";
import { emailTheme as t } from "./theme";

export interface EmailLayoutProps {
  /** Inbox preview line (hidden in the body, max ~150 chars). */
  preview: string;
  /** Completes the footer sentence "You're receiving this because …". No trailing period. */
  reason: string;
  children: ReactNode;
}

/** Shared frame for every transactional email: wordmark, content card, legal footer. */
export function EmailLayout({ preview, reason, children }: EmailLayoutProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.wordmark}>{APP.name}</Text>
          </Section>
          <Section style={styles.card}>{children}</Section>
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Questions? Contact us at{" "}
              <Link href={`mailto:${APP.supportEmail}`} style={styles.footerLink}>
                {APP.supportEmail}
              </Link>
              .
            </Text>
            <Text style={styles.footerText}>You&apos;re receiving this because {reason}.</Text>
            <Text style={styles.footerText}>
              {APP.name} is operated by {APP.legalEntity}, {APP.legalJurisdiction}.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: t.page,
    color: t.text,
    fontFamily: t.fontFamily,
    margin: 0,
    padding: "24px 0",
  },
  container: { maxWidth: "560px", width: "100%", margin: "0 auto", padding: "0 12px" },
  header: { padding: "8px 8px 16px" },
  wordmark: { color: t.brand, fontSize: "20px", fontWeight: 700, letterSpacing: "-0.01em", margin: 0 },
  card: {
    backgroundColor: t.card,
    border: `1px solid ${t.border}`,
    borderTop: `4px solid ${t.brand}`,
    borderRadius: "12px",
    padding: "28px 24px",
  },
  footer: { padding: "20px 8px 0" },
  footerText: { color: t.muted, fontSize: "12px", lineHeight: "18px", margin: "0 0 6px" },
  footerLink: { color: t.muted, textDecoration: "underline" },
} satisfies Record<string, CSSProperties>;
