import Link from "next/link";

import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";

/** Unknown, revoked or expired links, and media that was deleted or removed: an empty mat, print withdrawn. */
export default function SharedLinkNotFound() {
  return (
    <div className="mx-auto grid max-w-4xl items-center gap-10 px-4 py-16 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-14 sm:px-6 sm:py-24">
      <div aria-hidden="true" className="print-paper mx-auto w-44 p-4 pb-10 shadow-print sm:w-full sm:p-5 sm:pb-12">
        <div className="flex aspect-[4/5] items-center justify-center border border-dashed border-[#16140f]/35">
          <span className="font-mono text-[10px] tracking-[0.16em] text-[#16140f]/70 uppercase">Withdrawn</span>
        </div>
      </div>
      <div>
        <p className="mono-caps text-safelight-ink">Link closed · print withdrawn</p>
        <h1 className="mt-3 font-display text-4xl leading-[0.95] tracking-[-0.015em] sm:text-5xl">
          This link isn&apos;t available
        </h1>
        <p className="mt-4 max-w-md text-muted-foreground">
          It may have expired or been turned off by the person who shared it, or the content was removed.
        </p>
        <Button asChild variant="outline" className="mt-8 rounded-[3px]">
          <Link href="/">Visit {APP.name}</Link>
        </Button>
      </div>
    </div>
  );
}
