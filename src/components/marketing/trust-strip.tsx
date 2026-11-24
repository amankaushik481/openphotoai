import { BanIcon, ScanFaceIcon, Trash2Icon, UserCheckIcon } from "lucide-react";

import { GithubIcon } from "@/components/layout/icons";
import { TRAINING } from "@/config/app";

const ITEMS = [
  { icon: ScanFaceIcon, title: "Consent-verified", body: "Live selfie + face match on every photo" },
  { icon: UserCheckIcon, title: "Adults only", body: `${TRAINING.minAge}+, checked automatically` },
  { icon: BanIcon, title: "No NSFW, ever", body: "Filtered in and out, can't be switched off" },
  { icon: Trash2Icon, title: "Delete anytime", body: "Real deletion, confirmed by email" },
  { icon: GithubIcon, title: "Open source", body: "MIT-licensed, self-host it" },
] as const;

export function TrustStrip() {
  return (
    <section aria-label="Safety and trust" className="border-y border-border/70 bg-muted/40">
      <ul className="mx-auto grid max-w-6xl grid-cols-1 gap-x-6 gap-y-5 px-4 py-7 min-[420px]:grid-cols-2 sm:px-6 md:grid-cols-3 lg:grid-cols-5">
        {ITEMS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{title}</span>
              <span className="text-xs text-muted-foreground">{body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
