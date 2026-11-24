"use client";

import Link from "next/link";
import { CoinsIcon, LoaderCircleIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CREDIT_PACKS } from "@/config/plans";
import { cn } from "@/lib/utils";
import { formatCredits, formatPrice } from "./format";
import { PUBLIC_SIGNUP_HREF } from "./plan-cards";
import { useBillingActions } from "./use-billing-actions";

export interface CreditPackCardsProps {
  /** "public": buttons link to sign-in (pricing page). "app": buttons start a checkout. */
  mode: "public" | "app";
  className?: string;
}

/** One-time credit packs (credits never expire). */
export function CreditPackCards({ mode, className }: CreditPackCardsProps) {
  const { pending, checkout } = useBillingActions();

  return (
    <div className={cn("grid gap-4 sm:grid-cols-3", className)}>
      {CREDIT_PACKS.map((pack) => {
        const key = `pack:${pack.id}`;
        const perCredit = (pack.priceCents / pack.credits).toFixed(1);
        const titleId = `pack-${pack.id}-title`;
        return (
          <Card key={pack.id} aria-labelledby={titleId} className={cn("gap-4", pack.popular && "border-primary/50 shadow-md")}>
            <CardHeader className="gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <CardTitle id={titleId} className="flex items-center gap-2 text-base">
                  <CoinsIcon aria-hidden="true" className="size-4 text-primary" />
                  {pack.name}
                </CardTitle>
                {pack.popular && <Badge variant="brand">Best value</Badge>}
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-1">
              <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatPrice(pack.priceCents)}</p>
              <p className="text-xs text-muted-foreground">
                {perCredit}¢ per credit · {formatCredits(pack.credits)} credits that never expire
              </p>
            </CardContent>
            <CardFooter>
              {mode === "public" ? (
                <Button asChild variant={pack.popular ? "brand" : "outline"} className="w-full">
                  <Link href={PUBLIC_SIGNUP_HREF}>Buy {pack.name}</Link>
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
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
