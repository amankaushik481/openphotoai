"use client";

import * as React from "react";

/**
 * Browser storage for per-viewer conveniences (remembered settings, this tab's results). Values are
 * read once per page load and cached, so `useSyncExternalStore` gets a stable snapshot; writes go
 * through `writeStored` to update the cache too. Every storage access is guarded: storage can be
 * missing or throw (private mode, blocked site data), and the page must work without it.
 */
type Area = "local" | "session";

const cache = new Map<string, unknown>();
const cacheKey = (area: Area, key: string) => `${area}:${key}`;
const subscribe = () => () => {};

function storageOf(area: Area): Storage | null {
  try {
    return area === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The parsed stored value; null during SSR and hydration (or when `key` is null). */
export function useStoredValue<T>(area: Area, key: string | null, parse: (raw: string | null) => T): T | null {
  const getSnapshot = (): T | null => {
    if (key === null) return null;
    const id = cacheKey(area, key);
    if (!cache.has(id)) {
      let raw: string | null = null;
      try {
        raw = storageOf(area)?.getItem(key) ?? null;
      } catch {
        raw = null;
      }
      cache.set(id, parse(raw));
    }
    return cache.get(id) as T;
  };
  return React.useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** Store `value`; a `serialize` result of null removes the item (the cache keeps `value`). */
export function writeStored<T>(area: Area, key: string, value: T, serialize: (value: T) => string | null): void {
  cache.set(cacheKey(area, key), value);
  try {
    const storage = storageOf(area);
    const raw = serialize(value);
    if (raw === null) storage?.removeItem(key);
    else storage?.setItem(key, raw);
  } catch {
    // Quota exceeded or blocked: keep the in-memory copy only.
  }
}

/** Every per-viewer key this app writes to browser storage starts with this. */
export const VIEWER_STORAGE_PREFIX = "openshoot:";
/** The account whose conveniences are in this browser's storage. */
const VIEWER_OWNER_KEY = "openshoot:owner";

/**
 * Forget everything stored for the current viewer: remembered settings, this tab's results and
 * unsent prompt, gallery return state (storage and the in-memory cache). Called on sign-out.
 */
export function clearViewerStorage(): void {
  cache.clear();
  for (const area of ["local", "session"] as const) {
    const storage = storageOf(area);
    if (!storage) continue;
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith(VIEWER_STORAGE_PREFIX)) keys.push(key);
      }
      for (const key of keys) storage.removeItem(key);
    } catch {
      // Blocked storage: nothing to clear.
    }
  }
}

/**
 * Make `userId` the owner of this browser's stored conveniences. When another account used this
 * browser last (a shared computer, a sign-in without signing out first), its prompt, results and
 * settings are cleared before anything reads them.
 */
export function claimViewerStorage(userId: string): void {
  const storage = storageOf("local");
  let owner: string | null = null;
  try {
    owner = storage?.getItem(VIEWER_OWNER_KEY) ?? null;
  } catch {
    owner = null;
  }
  if (owner === userId) return;
  clearViewerStorage();
  try {
    storage?.setItem(VIEWER_OWNER_KEY, userId);
  } catch {
    // Blocked storage: nothing was stored for anyone either.
  }
}
