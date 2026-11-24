import Link from "next/link";
import { Link2OffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";

/** Unknown, revoked or expired links, and media that was deleted or removed. */
export default function SharedLinkNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center sm:py-28">
      <div
        aria-hidden="true"
        className="mb-5 flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground"
      >
        <Link2OffIcon className="size-6" />
      </div>
      <h1 className="font-display text-3xl sm:text-4xl">This link isn&apos;t available</h1>
      <p className="mt-3 text-muted-foreground">
        It may have expired or been turned off by the person who shared it, or the content was removed.
      </p>
      <Button asChild variant="outline" className="mt-8">
        <Link href="/">Visit {APP.name}</Link>
      </Button>
    </div>
  );
}
