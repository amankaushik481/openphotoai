"use client";

import * as React from "react";

import { claimViewerStorage } from "@/components/create/use-stored";

/**
 * Wraps the signed-in app. Before any page below reads browser storage (it renders first), it
 * clears what a different account left in this browser: see claimViewerStorage.
 */
export function ViewerStorageScope({ userId, children }: { userId: string; children: React.ReactNode }) {
  // A state initializer runs once per mount, during this component's render: before its children
  // render (and read storage). Client only; idempotent (Strict Mode may call it twice).
  React.useState(() => {
    if (typeof window !== "undefined") claimViewerStorage(userId);
  });
  return children;
}
