import { cn } from "@/lib/utils";

/** The landing page's editorial measure: a wide 12-column page with generous margins. */
export const SHELL = "mx-auto w-full max-w-[90rem] px-4 sm:px-8 lg:px-12";

/** Folio line opening a section: "No. 02 —— Process", set like a magazine's running head. */
export function Folio({ no, label, className }: { no: string; label: string; className?: string }) {
  return (
    <p className={cn("mono-caps flex items-center gap-3 text-muted-foreground", className)}>
      <span className="text-foreground">No. {no}</span>
      <span aria-hidden="true" className="h-px w-10 bg-current opacity-40" />
      <span>{label}</span>
    </p>
  );
}

/** Printer's registration mark (crosshair in a circle). Decorative. */
export function RegistrationMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cn("size-5", className)}>
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M12 0v24M0 12h24" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** Crop marks at the four corners of the parent (which must be `relative`). Decorative. */
export function CropMarks({ className, inset = "-14px" }: { className?: string; inset?: string }) {
  const arm = "absolute h-3.5 w-3.5 border-current";
  return (
    <span
      aria-hidden="true"
      className={cn("pointer-events-none absolute text-foreground/35", className)}
      style={{ inset }}
    >
      <span className={cn(arm, "top-0 left-0 border-t border-l")} />
      <span className={cn(arm, "top-0 right-0 border-t border-r")} />
      <span className={cn(arm, "bottom-0 left-0 border-b border-l")} />
      <span className={cn(arm, "right-0 bottom-0 border-r border-b")} />
    </span>
  );
}
