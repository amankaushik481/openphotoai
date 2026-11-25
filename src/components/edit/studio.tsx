import { cn } from "@/lib/utils";

/**
 * Shared look for the studio tools (edit, brush, enhance, pose, video, try-on, together): control panels
 * like the front of a camera, with mono labels and readouts, and the photo laid on a light table.
 * Class strings for primitives that are styled through `className`, plus two small wrappers.
 */

/** Field labels in every tool panel. */
// Explicit size/leading so tailwind-merge drops the Label primitive's `text-sm leading-none`.
export const STUDIO_LABEL = "mono-caps text-[11px] leading-tight text-muted-foreground";

/** Tabs as a mono row with a safelight underline (for `TabsList` / `TabsTrigger`). */
export const STUDIO_TABS_LIST =
  "h-auto w-full justify-start gap-6 rounded-none border-b border-foreground/15 bg-transparent p-0 text-muted-foreground";
export const STUDIO_TAB =
  "h-10 flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase -mb-px shadow-none data-[state=active]:border-safelight-ink data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-safelight-ink dark:data-[state=active]:bg-transparent pointer-coarse:h-11";

/** Square option chips (presets, voices, kinds); pair with `STUDIO_CHIP_ON` when chosen. */
export const STUDIO_CHIP = "rounded-sm";
export const STUDIO_CHIP_ON = "border-safelight-ink bg-accent/60 text-foreground";

/** Segmented toggle items (`ToggleGroupItem`): square, safelight edge when on. */
export const STUDIO_TOGGLE =
  "rounded-none first:rounded-none last:rounded-none data-[state=on]:border-safelight-ink data-[state=on]:bg-accent/60 data-[state=on]:text-foreground";

/** A tool's control panel: hairline frame with a mono header strip (kicker on the left, readout on the right). */
export function StudioPanel({
  kicker,
  readout,
  className,
  children,
}: {
  kicker: React.ReactNode;
  readout?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col border border-foreground/15 bg-card", className)}>
      <p className="flex items-center justify-between gap-3 border-b border-dashed border-foreground/20 px-4 py-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase sm:px-5">
        <span>{kicker}</span>
        {readout && <span className="text-right tabular-nums">{readout}</span>}
      </p>
      <div className="flex min-w-0 flex-col gap-5 p-4 sm:p-5">{children}</div>
    </div>
  );
}

/** The light table the photo rests on while you work on it (darkroom-raised in the dark). */
export function LightTable({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("border border-foreground/10 bg-secondary p-3 sm:p-6 dark:bg-darkroom-raised", className)}>
      {children}
    </div>
  );
}

/** Paper border + one soft, low shadow: how a photo sits on the light table. */
export const PRINT =
  "bg-[#fbf8f2] p-1.5 shadow-[0_14px_30px_-18px_rgb(22_20_15/0.55),0_2px_4px_-2px_rgb(22_20_15/0.25)] sm:p-2";
