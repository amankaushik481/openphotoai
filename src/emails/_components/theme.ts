/**
 * Email design tokens. Email clients ignore CSS variables and most stylesheets, so
 * templates use inline styles built from these values. Colors meet WCAG AA on white.
 */
export const emailTheme = {
  brand: "#6d28d9",
  brandText: "#ffffff",
  danger: "#b91c1c",
  text: "#18181b",
  muted: "#52525b",
  border: "#e4e4e7",
  page: "#f4f4f5",
  card: "#ffffff",
  calloutBg: "#f5f3ff",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
} as const;
