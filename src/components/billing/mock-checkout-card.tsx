"use client";

import * as React from "react";
import Link from "next/link";
import { FlaskConicalIcon, LoaderCircleIcon, LockIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { api, ApiClientError } from "@/lib/api-client";
import { formatCredits, formatPrice } from "./format";

export interface MockCheckoutItemView {
  name: string;
  description: string;
  priceCents: number;
  credits: number;
  /** Set for plan subscriptions. */
  interval?: "month" | "year";
}

export interface MockCheckoutCardProps {
  checkoutId: string;
  item: MockCheckoutItemView;
  email: string;
}

/** The test-mode stand-in for Stripe Checkout. */
export function MockCheckoutCard({ checkoutId, item, email }: MockCheckoutCardProps) {
  const [paying, setPaying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const price = formatPrice(item.priceCents);
  const per = item.interval === "year" ? " / year" : item.interval === "month" ? " / month" : "";

  async function pay() {
    setPaying(true);
    setError(null);
    try {
      const { redirectUrl } = await api<{ redirectUrl: string }>("/api/billing/mock/complete", {
        method: "POST",
        body: { checkoutId },
      });
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "The test payment failed. Please try again.");
      setPaying(false);
    }
  }

  return (
    <Card className="w-full max-w-md gap-5">
      <CardHeader className="gap-3">
        <Badge variant="warning" className="gap-1.5">
          <FlaskConicalIcon aria-hidden="true" />
          Test checkout — no real payment
        </Badge>
        <h1 className="text-xl leading-none font-semibold">Checkout</h1>
        <CardDescription>
          This app runs with the mock payment provider. Paying here simulates a successful Stripe payment.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium">{item.name}</p>
            <p className="text-sm text-muted-foreground">{item.description}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatCredits(item.credits)} credits{item.interval ? (item.interval === "year" ? " up front" : " every month") : ""}
            </p>
          </div>
          <p className="shrink-0 text-right font-semibold tabular-nums">
            {price}
            <span className="text-sm font-normal text-muted-foreground">{per}</span>
          </p>
        </div>
        <Separator />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total due today</span>
          <span className="text-lg font-semibold tabular-nums">{price}</span>
        </div>
        <p className="text-xs text-muted-foreground">Paying as {email}</p>
        {error && (
          <Alert variant="destructive" role="alert">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertTitle>Payment failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href="/app/billing?canceled=1" aria-disabled={paying} tabIndex={paying ? -1 : undefined}>
            Cancel
          </Link>
        </Button>
        <Button variant="brand" onClick={pay} disabled={paying} aria-busy={paying} className="w-full sm:w-auto">
          {paying ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : <LockIcon aria-hidden="true" />}
          Pay {price}
        </Button>
      </CardFooter>
    </Card>
  );
}
