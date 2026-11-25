/** Small building blocks shared by the email templates (inline styles only). */
import { Button, Heading, Link, Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { ec, emailTheme as t } from "./theme";

export function Title({ children }: { children: ReactNode }) {
  return (
    <Heading as="h1" style={styles.title} className={ec.text}>
      {children}
    </Heading>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.paragraph} className={ec.text}>
      {children}
    </Text>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.muted} className={ec.muted}>
      {children}
    </Text>
  );
}

/** Primary call to action. Keep it the first link in a template: dev tooling treats links[0] as the main action. */
export function CtaButton({ href, children, tone = "brand" }: { href: string; children: ReactNode; tone?: "brand" | "danger" }) {
  return (
    <Section style={styles.ctaSection}>
      <Button href={href} style={{ ...styles.button, backgroundColor: tone === "danger" ? t.danger : t.brand }}>
        {children}
      </Button>
    </Section>
  );
}

/** Copy-paste fallback for clients that block buttons. */
export function LinkFallback({ href }: { href: string }) {
  return (
    <Text style={styles.muted} className={ec.muted}>
      If the button doesn&apos;t work, copy and paste this link into your browser:
      <br />
      <Link href={href} style={styles.fallbackLink} className={ec.link}>
        {href}
      </Link>
    </Text>
  );
}

/** Inline link inside a paragraph (brand color, underlined; the brighter safelight in dark mode). */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={styles.inlineLink} className={ec.link}>
      {children}
    </Link>
  );
}

/** Highlighted box for user- or system-provided details (reasons, messages, summaries). */
export function Callout({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <Section style={styles.callout} className={ec.callout}>
      {label ? (
        <Text style={styles.calloutLabel} className={ec.muted}>
          {label}
        </Text>
      ) : null}
      <Text style={styles.calloutBody} className={ec.text}>
        {children}
      </Text>
    </Section>
  );
}

/** Two-column label/value list (receipts, references). Rendered as an accessible table. */
export function DetailList({ rows }: { rows: ReadonlyArray<readonly [label: string, value: ReactNode]> }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={styles.detailTable}
      className={ec.rule}
      data-text-format="dataTable"
    >
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={styles.detailLabel} className={`${ec.muted} ${ec.rule}`}>
              {label}
            </td>
            <td style={styles.detailValue} className={`${ec.text} ${ec.rule}`}>
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const styles = {
  title: {
    color: t.text,
    fontFamily: t.displayFontFamily,
    fontSize: "34px",
    lineHeight: "38px",
    fontWeight: 400,
    letterSpacing: "-0.01em",
    margin: "0 0 16px",
  },
  paragraph: { color: t.text, fontSize: "16px", lineHeight: "26px", margin: "0 0 16px" },
  muted: { color: t.muted, fontSize: "14px", lineHeight: "22px", margin: "0 0 12px" },
  ctaSection: { margin: "8px 0 24px" },
  button: {
    color: t.brandText,
    borderRadius: "3px",
    fontSize: "16px",
    fontWeight: 600,
    lineHeight: "24px",
    padding: "13px 26px",
    textDecoration: "none",
    display: "inline-block",
  },
  fallbackLink: { color: t.brand, wordBreak: "break-all", textDecoration: "underline" },
  inlineLink: { color: t.brand, textDecoration: "underline" },
  callout: {
    backgroundColor: t.calloutBg,
    borderLeft: `2px solid ${t.brand}`,
    padding: "12px 16px",
    margin: "0 0 16px",
  },
  calloutLabel: {
    color: t.muted,
    fontFamily: t.monoFontFamily,
    fontSize: "11px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    margin: "0 0 4px",
  },
  calloutBody: { color: t.text, fontSize: "15px", lineHeight: "24px", margin: 0, whiteSpace: "pre-line" },
  // A lab ledger: mono labels, dotted rules between lines, figures on the right.
  detailTable: { borderTop: `1px solid ${t.text}`, margin: "0 0 20px" },
  detailLabel: {
    color: t.muted,
    fontFamily: t.monoFontFamily,
    fontSize: "11px",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    padding: "11px 12px 9px 0",
    borderBottom: `1px dotted ${t.border}`,
    verticalAlign: "top",
    width: "40%",
  },
  detailValue: {
    color: t.text,
    fontFamily: t.monoFontFamily,
    fontSize: "14px",
    fontWeight: 600,
    padding: "10px 0",
    borderBottom: `1px dotted ${t.border}`,
    textAlign: "right",
  },
} satisfies Record<string, CSSProperties>;
