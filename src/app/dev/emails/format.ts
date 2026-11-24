const formatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium" });

export function formatTime(date: Date): string {
  return formatter.format(date);
}

export const STATUS_STYLES: Record<string, string> = {
  mocked: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
  sent: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  failed: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
};
