"use client";

import dynamic from "next/dynamic";

// The root error boundary is part of every page's initial JS; its UI (Button stack, dictionary) is
// only fetched when an error is actually shown, keeping it off the marketing pages' critical path.
const RootErrorView = dynamic(() => import("@/components/layout/root-error-view").then((m) => m.RootErrorView));

export default function ErrorPage({ error, retry }: { error: unknown; reset: () => void; retry: () => void }) {
  return <RootErrorView error={error} retry={retry} />;
}
