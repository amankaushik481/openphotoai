/**
 * Email design tokens, matching the app's "Darkroom" theme (src/app/globals.css: warm paper and ink,
 * one safelight-red accent). Email clients ignore CSS variables and most
 * stylesheets, so templates use inline styles built from these values; `emailDarkCss` re-colors them
 * (by class) in clients that support `prefers-color-scheme` (Apple Mail, iOS Mail, Outlook for Mac,
 * Outlook.com via `[data-ogsc]`). All text pairs meet WCAG AA in both palettes.
 */
export const emailTheme = {
  // Darkroom safelight (white on it 5.7:1) and warm paper neutrals, matching the web app.
  brand: "#c4280f",
  brandText: "#ffffff",
  danger: "#9f1c12",
  /** Ink on paper. */
  text: "#16140f",
  muted: "#5c554b",
  /** Hairlines: ink at ~14% on paper. */
  border: "#ddd5c8",
  page: "#f1ece3",
  /** Raised paper (the print). */
  card: "#fbf8f2",
  calloutBg: "#efe8dc",
  /** The film rebate along the footer: dark in both palettes. */
  film: "#16140f",
  filmText: "#d8cfc1",
  filmMuted: "#8f8676",
  fontFamily:
    '"Schibsted Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  /** The app's display face (Instrument Serif) isn't available in most mail clients: a close system serif. */
  displayFontFamily: '"Instrument Serif", Georgia, "Times New Roman", serif',
  /** Edge print, labels and figures. */
  monoFontFamily: '"IBM Plex Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
} as const;

export const emailDarkTheme = {
  text: "#eee7db",
  muted: "#a39a8c",
  border: "#2f2b26",
  page: "#0e0d0b",
  card: "#181613",
  link: "#f8664a",
  calloutBg: "#211e1a",
  film: "#060605",
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
  film: "os-film",
} as const;

const d = emailDarkTheme;
const DARK_RULES: [className: string, declarations: string][] = [
  [ec.body, `background-color:${d.page}!important;color:${d.text}!important`],
  [ec.card, `background-color:${d.card}!important;border-color:${d.border}!important`],
  [ec.text, `color:${d.text}!important`],
  [ec.muted, `color:${d.muted}!important`],
  [ec.link, `color:${d.link}!important`],
  [ec.wordmark, `color:${d.text}!important`],
  [ec.callout, `background-color:${d.calloutBg}!important`],
  [ec.rule, `border-color:${d.border}!important`],
  [ec.film, `background-color:${d.film}!important`],
];

const css = (prefix: string) => DARK_RULES.map(([cls, decl]) => `${prefix}.${cls}{${decl}}`).join("\n");

/** `<style>` contents: dark-mode overrides for clients that honor them (Outlook.com marks dark mode with data-ogsc). */
export const emailDarkCss = `:root{color-scheme:light dark;supported-color-schemes:light dark}
body{background-color:${emailTheme.page}}
@media (prefers-color-scheme: dark){
${css("")}
}
${css("[data-ogsc] ")}`;
