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

/** Our own film stock's edge print (never a real manufacturer's). */
const EDGE_PRINT = `${APP.name.toUpperCase()} 400 · SAFETY FILM`;

/**
 * Shared frame for every transactional email: the serif wordmark in ink, the message as a print on paper,
 * a film-rebate edge print, and the legal footer. Light + dark.
 */
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
            {/* The print: raised paper, a hairline edge, square corners. */}
            <Section style={styles.card} className={ec.card}>
              <div style={styles.cardBody}>{children}</div>
            </Section>
            {/* Edge print: a strip of film rebate, as along the bottom of a contact sheet. Visual only. */}
            <Section style={styles.film} className={ec.film} data-skip-in-text="true">
              <div style={styles.sprockets} />
              <Text style={styles.edgePrint}>
                {EDGE_PRINT}
                <span style={styles.edgeMark}> ▸ 01</span>
              </Text>
              <div style={styles.sprockets} />
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
    color: t.text,
    fontFamily: t.displayFontFamily,
    fontSize: "30px",
    fontWeight: 400,
    letterSpacing: "-0.01em",
    lineHeight: "34px",
    margin: 0,
  },
  card: {
    backgroundColor: t.card,
    border: `1px solid ${t.border}`,
    borderRadius: "2px",
  },
  cardBody: { padding: "32px 28px 28px" },
  film: { backgroundColor: t.film, padding: "2px 14px", margin: "0" },
  // Sprocket holes: a dashed rule (fluid width, no images, supported by every mail client).
  sprockets: { borderTop: `4px dashed ${t.filmMuted}`, height: 0, lineHeight: 0, fontSize: 0, margin: "4px 0" },
  edgePrint: {
    color: t.filmText,
    fontFamily: t.monoFontFamily,
    fontSize: "10px",
    letterSpacing: "0.2em",
    lineHeight: "16px",
    margin: "2px 0",
  },
  edgeMark: { color: "#f8664a" },
  footer: { padding: "18px 8px 0" },
  footerText: { color: t.muted, fontSize: "12px", lineHeight: "18px", margin: "0 0 6px" },
  footerLink: { color: t.muted, textDecoration: "underline" },
} satisfies Record<string, CSSProperties>;
