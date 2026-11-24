/**
 * Accessible inline-SVG column chart for small daily series (server component, no JS).
 * - One baseline, columns ≤ 24 units wide with a 4px rounded data end and a 2px gap.
 * - Optional `part` (e.g. failed jobs) is drawn as the lower segment of each column with a legend.
 * - Hover/focus text comes from <title>; the full data is in a collapsible table (text alternative).
 */
import { cn } from "@/lib/utils";
import { formatDayKey } from "./format";

export interface BarDatum {
  /** UTC day key (YYYY-MM-DD). */
  date: string;
  value: number;
  /** Sub-part of `value` drawn as the lower segment (must be ≤ value). */
  part?: number;
}

export interface BarChartProps {
  id: string;
  title: string;
  data: readonly BarDatum[];
  format: (value: number) => string;
  /** Labels used in the legend + table when `part` is present. */
  valueLabel?: string;
  partLabel?: string;
  className?: string;
}

const W = 600;
const H = 140;
const PAD_TOP = 6;
const GAP = 2;
const MAX_BAR = 24;
const RADIUS = 4;

/** Column from `yBase` to `yEnd`; only the data end (yEnd) is rounded, and only when `rounded`. */
function columnPath(x: number, w: number, yBase: number, yEnd: number, rounded = true): string {
  const h = Math.abs(yBase - yEnd);
  if (h < 0.5) return "";
  const r = rounded ? Math.min(RADIUS, w / 2, h) : 0;
  const dir = yEnd < yBase ? 1 : -1; // 1 = grows upward
  const yr = yEnd + dir * r;
  return [
    `M${x},${yBase}`,
    `V${yr}`,
    `Q${x},${yEnd} ${x + r},${yEnd}`,
    `H${x + w - r}`,
    `Q${x + w},${yEnd} ${x + w},${yr}`,
    `V${yBase}`,
    "Z",
  ].join(" ");
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

export function BarChart({ id, title, data, format, valueLabel = "Total", partLabel, className }: BarChartProps) {
  const values = data.map((d) => d.value);
  const total = values.reduce((sum, v) => sum + v, 0);
  const maxValue = Math.max(0, ...values);
  const minValue = Math.min(0, ...values);
  const top = niceMax(maxValue);
  const bottom = minValue < 0 ? -niceMax(-minValue) : 0;
  const scale = (v: number) => PAD_TOP + ((top - v) / (top - bottom)) * (H - PAD_TOP);
  const base = scale(0);
  const slot = data.length ? W / data.length : W;
  const barW = Math.max(1, Math.min(MAX_BAR, slot - GAP));
  const hasParts = data.some((d) => (d.part ?? 0) > 0);
  const peak = data.reduce<BarDatum | null>((best, d) => (!best || d.value > best.value ? d : best), null);
  const summaryId = `${id}-summary`;

  const summary = data.length
    ? `${title}, ${formatDayKey(data[0]!.date)} to ${formatDayKey(data[data.length - 1]!.date)}: total ${format(total)}` +
      (peak && peak.value > 0 ? `, highest ${format(peak.value)} on ${formatDayKey(peak.date)}.` : ".")
    : `${title}: no data.`;

  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)} aria-labelledby={`${id}-title`}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span id={`${id}-title`} className="text-sm font-medium">
          {title}
        </span>
        {hasParts && partLabel && (
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-chart-3" />
              {valueLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-destructive" />
              {partLabel}
            </span>
          </span>
        )}
      </figcaption>

      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
        <div aria-hidden="true" className="flex flex-col justify-between text-right text-[11px] leading-none text-muted-foreground tabular-nums">
          <span>{format(top)}</span>
          <span>{format(bottom)}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={summaryId} className="h-auto w-full min-w-0">
          <line x1={0} x2={W} y1={PAD_TOP} y2={PAD_TOP} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {data.map((d, i) => {
            const x = i * slot + (slot - barW) / 2;
            const part = Math.min(Math.max(d.part ?? 0, 0), Math.max(d.value, 0));
            const partTop = scale(part);
            // The upper segment starts 2 units above the part (surface gap) when both exist.
            const restBase = part > 0 ? partTop - GAP : base;
            const restPath = d.value > part ? columnPath(x, barW, restBase, Math.min(scale(d.value), restBase)) : "";
            const label =
              `${formatDayKey(d.date)}: ${format(d.value)}` + (partLabel && part > 0 ? ` (${partLabel.toLowerCase()} ${format(part)})` : "");
            return (
              <g key={d.date} className="group">
                <title>{label}</title>
                <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
                {d.value < 0 ? (
                  <path d={columnPath(x, barW, base, scale(d.value))} className="fill-chart-3 group-hover:opacity-75" />
                ) : (
                  <>
                    {part > 0 && (
                      <path d={columnPath(x, barW, base, partTop, !restPath)} className="fill-destructive group-hover:opacity-75" />
                    )}
                    {restPath && <path d={restPath} className="fill-chart-3 group-hover:opacity-75" />}
                  </>
                )}
              </g>
            );
          })}
          <line x1={0} x2={W} y1={base} y2={base} className="stroke-muted-foreground/50" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </svg>
        {data.length > 0 && (
          <div aria-hidden="true" className="col-start-2 flex justify-between text-[11px] text-muted-foreground">
            <span>{formatDayKey(data[0]!.date)}</span>
            <span>{formatDayKey(data[data.length - 1]!.date)}</span>
          </div>
        )}
      </div>

      <p id={summaryId} className="text-xs text-muted-foreground">
        {summary}
      </p>

      <details className="group/details text-sm">
        <summary className="w-fit cursor-pointer rounded-sm text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          Show data table
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-left font-medium">
                  Day
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">
                  {valueLabel}
                </th>
                {partLabel && (
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">
                    {partLabel}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date} className="border-t">
                  <th scope="row" className="px-3 py-1 text-left font-normal">
                    {formatDayKey(d.date)}
                  </th>
                  <td className="px-3 py-1 text-right tabular-nums">{format(d.value)}</td>
                  {partLabel && <td className="px-3 py-1 text-right tabular-nums">{format(d.part ?? 0)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
