import { Body, Container, Head, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { APP } from "@/config/app";
import { ec, emailDarkCss, emailTheme as t } from "./theme";

export interface EmailLayoutProps {
  /** Inbox preview line (hidden in the body, max ~150 chars). */
  preview: string;
  /** Completes the footer sentence "You're receiving this because …". No trailing period. */
  reason: string;
  children: ReactNode;
}

/** Shared frame for every transactional email: wordmark, brand bar, content card, legal footer. Light + dark. */
export function EmailLayout({ preview, reason, children }: EmailLayoutProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{emailDarkCss}</style>
      </Head>
      <Preview>{preview}</Preview>
      {/* React Email copies Body's style onto an inner cell that has no class, so the page colors live on our
          own wrapper (and on the body tag through the stylesheet) where dark mode can re-color them. */}
      <Body style={styles.bodyReset} className={ec.body}>
        <Section style={styles.body} className={ec.body}>
          <Container style={styles.container}>
            <Section style={styles.header}>
              {/* Plain text, not a link: dev tooling and tests treat an email's first link as its main action. */}
              <Text style={styles.wordmark} className={ec.wordmark}>
                {APP.name}
              </Text>
            </Section>
            <Section style={styles.card} className={ec.card}>
              {/* Brand gradient bar; a solid violet where gradients aren't supported. */}
              <div style={styles.bar} />
              <div style={styles.cardBody}>{children}</div>
            </Section>
            <Section style={styles.footer}>
              <Text style={styles.footerText} className={ec.muted}>
                Questions? Contact us at{" "}
                <Link href={`mailto:${APP.supportEmail}`} style={styles.footerLink} className={ec.muted}>
                  {APP.supportEmail}
                </Link>
                .
              </Text>
              <Text style={styles.footerText} className={ec.muted}>
                You&apos;re receiving this because {reason}.
              </Text>
              <Text style={styles.footerText} className={ec.muted}>
                {APP.name} is operated by {APP.legalEntity}, {APP.legalJurisdiction}.
              </Text>
            </Section>
          </Container>
        </Section>
      </Body>
    </Html>
  );
}

const styles = {
  bodyReset: { margin: 0, padding: 0 },
  body: {
    backgroundColor: t.page,
    color: t.text,
    fontFamily: t.fontFamily,
    margin: 0,
    padding: "24px 0",
  },
  container: { maxWidth: "560px", width: "100%", margin: "0 auto", padding: "0 12px" },
  header: { padding: "8px 8px 16px" },
  wordmark: {
    color: t.brand,
    fontFamily: t.displayFontFamily,
    fontSize: "28px",
    fontWeight: 400,
    letterSpacing: "-0.01em",
    lineHeight: "32px",
    margin: 0,
  },
  card: {
    backgroundColor: t.card,
    border: `1px solid ${t.border}`,
    borderRadius: "12px",
    overflow: "hidden",
  },
  bar: { height: "4px", lineHeight: "4px", fontSize: "1px", backgroundColor: t.brand, backgroundImage: t.gradient },
  cardBody: { padding: "28px 24px" },
  footer: { padding: "20px 8px 0" },
  footerText: { color: t.muted, fontSize: "12px", lineHeight: "18px", margin: "0 0 6px" },
  footerLink: { color: t.muted, textDecoration: "underline" },
} satisfies Record<string, CSSProperties>;
