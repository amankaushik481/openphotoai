/** Small building blocks shared by the email templates (inline styles only). */
import { Button, Heading, Link, Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { emailTheme as t } from "./theme";

export function Title({ children }: { children: ReactNode }) {
  return (
    <Heading as="h1" style={styles.title}>
      {children}
    </Heading>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
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
    <Text style={styles.muted}>
      If the button doesn&apos;t work, copy and paste this link into your browser:
      <br />
      <Link href={href} style={styles.fallbackLink}>
        {href}
      </Link>
    </Text>
  );
}

/** Highlighted box for user- or system-provided details (reasons, messages, summaries). */
export function Callout({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <Section style={styles.callout}>
      {label ? <Text style={styles.calloutLabel}>{label}</Text> : null}
      <Text style={styles.calloutBody}>{children}</Text>
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
      data-text-format="dataTable"
    >
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={styles.detailLabel}>{label}</td>
            <td style={styles.detailValue}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const styles = {
  title: { color: t.text, fontSize: "24px", lineHeight: "32px", fontWeight: 700, margin: "0 0 16px" },
  paragraph: { color: t.text, fontSize: "16px", lineHeight: "26px", margin: "0 0 16px" },
  muted: { color: t.muted, fontSize: "14px", lineHeight: "22px", margin: "0 0 12px" },
  ctaSection: { margin: "8px 0 24px" },
  button: {
    color: t.brandText,
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: 600,
    lineHeight: "24px",
    padding: "12px 24px",
    textDecoration: "none",
    display: "inline-block",
  },
  fallbackLink: { color: t.brand, wordBreak: "break-all", textDecoration: "underline" },
  callout: {
    backgroundColor: t.calloutBg,
    borderLeft: `4px solid ${t.brand}`,
    borderRadius: "6px",
    padding: "12px 16px",
    margin: "0 0 16px",
  },
  calloutLabel: { color: t.muted, fontSize: "13px", fontWeight: 600, margin: "0 0 4px" },
  calloutBody: { color: t.text, fontSize: "15px", lineHeight: "24px", margin: 0, whiteSpace: "pre-line" },
  detailTable: { borderTop: `1px solid ${t.border}`, margin: "0 0 20px" },
  detailLabel: {
    color: t.muted,
    fontSize: "14px",
    padding: "10px 12px 10px 0",
    borderBottom: `1px solid ${t.border}`,
    verticalAlign: "top",
    width: "40%",
  },
  detailValue: {
    color: t.text,
    fontSize: "15px",
    fontWeight: 600,
    padding: "10px 0",
    borderBottom: `1px solid ${t.border}`,
    textAlign: "right",
  },
} satisfies Record<string, CSSProperties>;
