import {
  BrushIcon,
  Building2Icon,
  CodeIcon,
  ImageUpscaleIcon,
  LayersIcon,
  ShirtIcon,
  SparklesIcon,
  UsersIcon,
  VideoIcon,
  WandSparklesIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";

import { MarketingSection, SectionHeading } from "@/components/marketing/section-heading";
import { PortraitArt, type PortraitHair } from "@/components/marketing/portrait-art";
import { CREDIT_COSTS } from "@/config/credits";
import { PAID_PLAN_IDS, PLANS, type Plan } from "@/config/plans";
import { formatCreditCost } from "@/content/credit-costs";
import { cn } from "@/lib/utils";

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  cost: string;
}

const maxBatch = Math.max(...PAID_PLAN_IDS.map((id) => PLANS[id].limits.maxBatch));

/** "Pro & Studio": names of the paid plans that include a capability. */
function plansWith(test: (limits: Plan["limits"]) => boolean): string {
  const names = PAID_PLAN_IDS.filter((id) => test(PLANS[id].limits)).map((id) => PLANS[id].name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : (names[0] ?? "Paid plans");
}

const FEATURES: Feature[] = [
  {
    icon: ZapIcon,
    title: "Instant drafts",
    body: "Free low-res previews in seconds. Render only the ones you love in full quality, same seed.",
    cost: formatCreditCost(CREDIT_COSTS.generateDraft),
  },
  {
    icon: BrushIcon,
    title: "Edit & brush",
    body: "Change outfit, background, hair or expression with a sentence, or paint over any area.",
    cost: formatCreditCost(CREDIT_COSTS.edit),
  },
  {
    icon: ImageUpscaleIcon,
    title: "Upscale & restore",
    body: "Upscale 2× or 4× for print, restore faces, remove backgrounds in one click.",
    cost: `from ${formatCreditCost(Math.min(CREDIT_COSTS.faceRestore, CREDIT_COSTS.removeBackground, CREDIT_COSTS.upscale2x))}`,
  },
  {
    icon: VideoIcon,
    title: "Video & talking video",
    body: "Bring a photo to life in a 5–10 s clip, or have yourself say a script.",
    cost: `from ${formatCreditCost(Math.min(CREDIT_COSTS.video5s, CREDIT_COSTS.talkingVideoPer5s))}`,
  },
  {
    icon: WandSparklesIcon,
    title: "Pose copy",
    body: "Upload any reference photo and get yourself in that pose, outfit and setting.",
    cost: formatCreditCost(CREDIT_COSTS.poseCopy),
  },
  {
    icon: ShirtIcon,
    title: "Virtual try-on",
    body: "Upload a garment and see it on one of your photos before you buy.",
    cost: formatCreditCost(CREDIT_COSTS.tryOn),
  },
  {
    icon: UsersIcon,
    title: "Together photos",
    body: "Shoot with your partner or co-founder. Both people consent in the app first.",
    cost: formatCreditCost(CREDIT_COSTS.multiPerson),
  },
  {
    icon: LayersIcon,
    title: `Batch ${maxBatch}`,
    body: `Run a whole pack, up to ${maxBatch} photos, in one click with live progress.`,
    cost: plansWith((l) => l.maxBatch === maxBatch),
  },
  {
    icon: Building2Icon,
    title: "Brand kits",
    body: "Consistent team headshots: shared backdrops, outfits, lighting and crop for everyone.",
    cost: plansWith((l) => l.teamSeats > 0),
  },
  {
    icon: CodeIcon,
    title: "Public API",
    body: "API keys, batches and an OpenAPI 3.1 spec. Automate headshots for your whole org.",
    cost: plansWith((l) => l.apiAccess),
  },
];

const SCORES: { score: number; hair: PortraitHair; colors: [string, string]; refunded?: boolean }[] = [
  { score: 97, hair: "short", colors: ["#1d4ed8", "#38bdf8"] },
  { score: 95, hair: "long", colors: ["#b45309", "#fcd34d"] },
  { score: 92, hair: "bun", colors: ["#9d174d", "#f472b6"] },
  { score: 61, hair: "curly", colors: ["#4c1d95", "#22d3ee"], refunded: true },
];

export function FeatureGrid({ packCount, packNames }: { packCount: number; packNames: string[] }) {
  return (
    <MarketingSection labelledBy="features-title">
      <SectionHeading
        id="features-title"
        eyebrow="Everything in one studio"
        title="A whole photo studio, minus the studio."
        lead="Every feature shows its credit cost before you click. No surprises, no hidden tiers for likeness."
      />
      <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <li className="flex flex-col rounded-2xl border-brand-gradient p-6 shadow-xs sm:col-span-2 lg:row-span-2">
          <FeatureHeader icon={SparklesIcon} title="Best-shots picker + likeness guarantee" cost="Auto-refund" />
          <p className="mt-2 text-sm text-muted-foreground">
            Every photo is scored against your consent selfie. Your strongest shots come first; anything below the
            likeness threshold is hidden and its credits go straight back to your balance. No ticket, no argument.
          </p>
          <ul aria-label="Example likeness scores" className="mt-6 grid flex-1 grid-cols-4 content-end gap-2 sm:gap-3">
            {SCORES.map((s) => (
              <li key={s.score} className="flex flex-col gap-1.5">
                <div
                  className={cn("grain relative aspect-[4/5] overflow-hidden rounded-lg", s.refunded && "opacity-45 grayscale")}
                  style={{ backgroundImage: `linear-gradient(150deg, ${s.colors[0]}, ${s.colors[1]})` }}
                >
                  <PortraitArt hair={s.hair} light={s.score % 2 ? 40 : 120} />
                </div>
                <span className="flex flex-col text-[11px] leading-tight">
                  <span className={cn("font-mono tabular-nums", s.refunded ? "line-through" : "font-medium text-success")}>
                    {s.score}% likeness
                  </span>
                  <span className="text-muted-foreground">{s.refunded ? "Hidden · refunded" : "Kept"}</span>
                </span>
              </li>
            ))}
          </ul>
        </li>
        <li className="flex flex-col rounded-2xl border bg-card p-6 shadow-xs sm:col-span-2">
          <FeatureHeader icon={LayersIcon} title={`${packCount} photo packs`} cost={`from ${formatCreditCost(CREDIT_COSTS.generateStandard)} / photo`} />
          <p className="mt-2 text-sm text-muted-foreground">
            Curated shoots for LinkedIn, dating, travel, editorial and more, written by people who care about light.
            Packs are open JSON files: add your own in minutes.
          </p>
          <ul aria-label="Popular packs" className="mt-5 flex flex-wrap gap-2">
            {packNames.map((name) => (
              <li key={name} className="rounded-full border bg-background px-3 py-1 text-xs font-medium">
                {name}
              </li>
            ))}
          </ul>
        </li>
        {FEATURES.map((f) => (
          <li key={f.title} className="flex flex-col rounded-2xl border bg-card p-6 shadow-xs">
            <FeatureHeader icon={f.icon} title={f.title} cost={f.cost} />
            <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
          </li>
        ))}
      </ul>
    </MarketingSection>
  );
}

function FeatureHeader({ icon: Icon, title, cost }: { icon: LucideIcon; title: string; cost: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-foreground">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <span className="rounded-full border px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-muted-foreground">
          {cost}
        </span>
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
    </div>
  );
}
