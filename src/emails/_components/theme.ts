/**
 * Email design tokens, matching the app's light theme (src/app/globals.css: warm neutrals, violet
 * primary, coral → magenta → violet brand gradient). Email clients ignore CSS variables and most
 * stylesheets, so templates use inline styles built from these values; `emailDarkCss` re-colors them
 * (by class) in clients that support `prefers-color-scheme` (Apple Mail, iOS Mail, Outlook for Mac,
 * Outlook.com via `[data-ogsc]`). All text pairs meet WCAG AA in both palettes.
 */
export const emailTheme = {
  brand: "#8230d8",
  brandText: "#ffffff",
  danger: "#b91c1c",
  text: "#110d0b",
  muted: "#605954",
  border: "#e2dfdb",
  page: "#fbf9f6",
  card: "#fefefc",
  calloutBg: "#ebe4fa",
  gradient: "linear-gradient(120deg, #d13812 0%, #cd207c 52%, #7c33dc 100%)",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
  /** The app's display face (Instrument Serif) isn't available in mail clients: a close system serif. */
  displayFontFamily: '"Instrument Serif", Georgia, "Times New Roman", serif',
} as const;

export const emailDarkTheme = {
  text: "#f6f3ee",
  muted: "#a6a09a",
  border: "#2a2523",
  page: "#0d0a08",
  card: "#14110f",
  link: "#c28efb",
  calloutBg: "#2b1f3f",
} as const;

/** Class names the dark stylesheet targets (inline styles stay the light default). */
export const ec = {
  body: "os-body",
  card: "os-card",
  text: "os-text",
  muted: "os-muted",
  link: "os-link",
  wordmark: "os-wordmark",
  callout: "os-callout",
  rule: "os-rule",
} as const;

const d = emailDarkTheme;
const DARK_RULES: [className: string, declarations: string][] = [
  [ec.body, `background-color:${d.page}!important;color:${d.text}!important`],
  [ec.card, `background-color:${d.card}!important;border-color:${d.border}!important`],
  [ec.text, `color:${d.text}!important`],
  [ec.muted, `color:${d.muted}!important`],
  [ec.link, `color:${d.link}!important`],
  [ec.wordmark, `color:${d.link}!important`],
  [ec.callout, `background-color:${d.calloutBg}!important`],
  [ec.rule, `border-color:${d.border}!important`],
];

const css = (prefix: string) => DARK_RULES.map(([cls, decl]) => `${prefix}.${cls}{${decl}}`).join("\n");

/** `<style>` contents: dark-mode overrides for clients that honor them (Outlook.com marks dark mode with data-ogsc). */
export const emailDarkCss = `:root{color-scheme:light dark;supported-color-schemes:light dark}
body{background-color:${emailTheme.page}}
@media (prefers-color-scheme: dark){
${css("")}
}
${css("[data-ogsc] ")}`;
