import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** An icon element, e.g. `<ImagesIcon />` (sized automatically). */
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary call to action (e.g. a Button). */
  action?: React.ReactNode;
  className?: string;
  size?: "default" | "sm";
}

export function EmptyState({ icon, title, description, action, className, size = "default" }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "grain flex flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed text-center",
        size === "default" ? "px-6 py-14 sm:py-20" : "px-4 py-8",
        className,
      )}
    >
      {icon && (
        <div
          aria-hidden="true"
          className="mb-1 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground [&_svg]:size-6"
        >
          {icon}
        </div>
      )}
      <h2 className={cn("font-semibold", size === "default" ? "text-lg" : "text-base")}>{title}</h2>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
