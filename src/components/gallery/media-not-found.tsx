import Link from "next/link";
import { ImageOffIcon, ImagesIcon, SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** A deleted photo, a removed one, or a link to someone else's: say so inside the app, with a way on. */
export function MediaNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center sm:py-20">
      <span
        aria-hidden="true"
        className="mb-1 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground"
      >
        <ImageOffIcon className="size-6" />
      </span>
      <h1 className="font-display text-3xl tracking-tight">This photo isn&apos;t here</h1>
      <p className="text-sm text-muted-foreground">
        It was deleted, removed after a report, or the link belongs to another account. Deleted photos and videos
        can&apos;t be recovered.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="brand">
          <Link href="/app/gallery">
            <ImagesIcon aria-hidden="true" />
            Back to your gallery
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/app/create">
            <SparklesIcon aria-hidden="true" />
            Create photos
          </Link>
        </Button>
      </div>
    </div>
  );
}
