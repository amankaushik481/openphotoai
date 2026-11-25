import Link from "next/link";
import { ApertureIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PencilCross } from "./marks";

/** A deleted photo, a removed one, or a link to someone else's: say so inside the app, with a way on. */
export function MediaNotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-10 sm:py-16">
      <div aria-hidden="true" className="flex items-end gap-3">
        <div className="relative w-24 border border-dashed border-foreground/25 p-1.5 pb-0 sm:w-28">
          <div className="aspect-[4/5] bg-muted/60" />
          <div className="flex h-7 items-center font-mono text-[10px] tracking-[0.12em] text-muted-foreground">▸ 00</div>
          <PencilCross strokeWidth={2.4} className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)]" />
        </div>
        <p className="mono-caps pb-8 text-muted-foreground">Frame missing · not on this roll</p>
      </div>
      <div className="flex flex-col gap-3 border-t border-foreground/15 pt-6">
        <h1 className="font-display text-4xl leading-none tracking-tight sm:text-5xl">This photo isn&apos;t here</h1>
        <p className="max-w-[60ch] text-sm text-muted-foreground sm:text-base">
          It was deleted, removed after a report, or the link belongs to another account. Deleted photos and videos
          can&apos;t be recovered.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="brand">
            <Link href="/app/gallery">Back to your gallery</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/create">
              <ApertureIcon aria-hidden="true" />
              Create photos
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
