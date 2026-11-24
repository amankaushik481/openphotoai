/** Tiny dependency-free console helpers for CLI scripts. */

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const paint = (code: number) => (text: string) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);

export const color = {
  bold: paint(1),
  dim: paint(2),
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  cyan: paint(36),
};

export const log = {
  step: (text: string) => console.log(`\n${color.bold(color.cyan("›"))} ${color.bold(text)}`),
  info: (text: string) => console.log(`  ${text}`),
  ok: (text: string) => console.log(`  ${color.green("✓")} ${text}`),
  warn: (text: string) => console.warn(`  ${color.yellow("!")} ${text}`),
  error: (text: string) => console.error(`  ${color.red("✗")} ${text}`),
};

/** Render rows as an aligned plain-text table (first row = header). */
export function formatTable(rows: string[][]): string {
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, cell.length)));
  const line = (row: string[]) => row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ").trimEnd();
  const [header, ...body] = rows;
  if (!header) return "";
  const rule = widths.map((w) => "─".repeat(w)).join("  ");
  return [color.bold(line(header)), color.dim(rule), ...body.map(line)].join("\n");
}

/** Message of an unknown thrown value. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
