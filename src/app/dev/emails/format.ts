const formatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium" });

export function formatTime(date: Date): string {
  return formatter.format(date);
}

export const STATUS_STYLES: Record<string, string> = {
  mocked: "border-foreground/25 text-muted-foreground",
  sent: "border-success/50 text-success",
  failed: "border-safelight-ink/60 text-safelight-ink",
};
