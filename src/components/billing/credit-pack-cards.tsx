"use client";

import Link from "next/link";
import { LoaderCircleIcon } from "lucide-react";

import { PencilCircle } from "@/components/gallery/marks";
import { Button } from "@/components/ui/button";
import { CREDIT_PACKS } from "@/config/plans";
import { cn } from "@/lib/utils";
import { formatCredits, formatPerCredit, formatPrice } from "./format";
import { publicCheckoutHref } from "./checkout-intent";
import { useBillingActions } from "./use-billing-actions";

export interface CreditPackCardsProps {
  /** "public": buttons link to sign-in (pricing page). "app": buttons start a checkout. */
  mode: "public" | "app";
  className?: string;
}

/**
 * One-time credit packs (credits never expire), set as editorial columns on a photo-lab price board: a
 * heavy rule on top, hairlines between columns, the price large and the per-credit rate in mono.
 */
export function CreditPackCards({ mode, className }: CreditPackCardsProps) {
  const { pending, checkout } = useBillingActions();

  return (
    <div className={cn("border-t border-foreground/25", className)}>
      {/* gap-px over a hairline-coloured ground draws the rules between the columns. */}
      <div className="grid gap-px bg-foreground/15 sm:-mx-5 sm:grid-cols-3">
        {CREDIT_PACKS.map((pack, i) => {
          const key = `pack:${pack.id}`;
          const perCredit = formatPerCredit(pack.priceCents, pack.credits);
          const titleId = `pack-${pack.id}-title`;
          return (
            <article key={pack.id} aria-labelledby={titleId} className="flex flex-col gap-4 bg-background py-5 sm:px-5">
              <div className="flex min-h-6 items-center justify-between gap-2">
                <p aria-hidden="true" className="mono-caps text-muted-foreground">
                  Pack {String(i + 1).padStart(2, "0")}
                </p>
                {pack.popular && (
                  <span className="relative px-2 py-1 font-mono text-[10px] leading-none tracking-[0.16em] text-safelight-ink uppercase">
                    Best value
                    <PencilCircle
                      variant={2}
                      strokeWidth={1.8}
                      className="absolute -inset-x-1 -inset-y-1.5 h-[calc(100%+0.75rem)] w-[calc(100%+0.5rem)]"
                    />
                  </span>
                )}
              </div>
              <h3 id={titleId} className="text-base font-medium">
                {pack.name}
              </h3>
              <div className="flex flex-col gap-1.5">
                <p className="font-display text-6xl leading-none tracking-tight tabular-nums">
                  {formatPrice(pack.priceCents)}
                </p>
                <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
                  {perCredit} per credit · {formatCredits(pack.credits)} credits that never expire
                </p>
              </div>
              <div className="mt-auto pt-1">
                {mode === "public" ? (
                  <Button asChild variant={pack.popular ? "brand" : "outline"} className="w-full">
                    <Link href={publicCheckoutHref({ type: "credit_pack", packId: pack.id })}>Buy {pack.name}</Link>
                  </Button>
                ) : (
                  <Button
                    variant={pack.popular ? "brand" : "outline"}
                    className="w-full"
                    disabled={pending !== null}
                    aria-busy={pending === key}
                    onClick={() => checkout({ type: "credit_pack", packId: pack.id }, key)}
                  >
                    {pending === key && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
                    Buy for {formatPrice(pack.priceCents)}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
