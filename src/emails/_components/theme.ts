/**
 * Email design tokens. Email clients ignore CSS variables and most stylesheets, so
 * templates use inline styles built from these values. Colors meet WCAG AA on white.
 */
export const emailTheme = {
  // Darkroom safelight (white on it 5.7:1) and warm paper neutrals, matching the web app.
  brand: "#c4280f",
  brandText: "#ffffff",
  danger: "#9f1c12",
  text: "#16140f",
  muted: "#5c554b",
  border: "#e2dccf",
  page: "#f1ece3",
  card: "#ffffff",
  calloutBg: "#f6f1e8",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
} as const;
