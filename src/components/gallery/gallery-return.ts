/**
 * "Back to the gallery" without losing your place (pure storage protocol; unit-tested).
 *
 * The gallery remembers its scroll position when a photo is opened; the viewer records which photo
 * you were on when you go back (the Gallery link or Escape push a new history entry, so the browser
 * can't restore the position on its own). The gallery then scrolls back and reveals that photo, which
 * may be a different one after browsing with the arrow keys.
 */

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const SCROLL_KEY = "openshoot:gallery-scroll";
const RETURN_KEY = "openshoot:gallery-return";
/** Older notes are ignored (a stale note must never yank a later visit around). */
export const RETURN_MAX_AGE_MS = 30 * 60_000;

interface ScrollNote {
  list: string;
  scrollY: number;
  at: number;
}

interface ReturnNote {
  list: string;
  mediaId: string;
  at: number;
}

export interface GalleryRestore {
  /** Scroll position the gallery had when the viewer was opened (same list only). */
  scrollY: number | null;
  /** Photo to reveal and focus. */
  mediaId: string;
}

function read<T>(storage: StorageLike | null, key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: StorageLike | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota: losing the scroll position is harmless.
  }
}

/** sessionStorage when available (SSR, sandboxed iframes and some privacy modes have none). */
export function sessionStore(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Gallery: a photo is being opened from `list` (its serialized filters) at `scrollY`. */
export function rememberGalleryScroll(storage: StorageLike | null, list: string, scrollY: number, now = Date.now()) {
  write(storage, SCROLL_KEY, { list, scrollY: Math.max(0, Math.round(scrollY)), at: now } satisfies ScrollNote);
}

/** Viewer: going back to `list` from `mediaId`. */
export function rememberGalleryReturn(storage: StorageLike | null, list: string, mediaId: string, now = Date.now()) {
  write(storage, RETURN_KEY, { list, mediaId, at: now } satisfies ReturnNote);
}

/**
 * Gallery mount: what to restore for `list`, consuming the viewer's note (each return restores once).
 * Null when the visit didn't come from the viewer's back action for this same list.
 */
export function takeGalleryRestore(storage: StorageLike | null, list: string, now = Date.now()): GalleryRestore | null {
  const note = read<ReturnNote>(storage, RETURN_KEY);
  if (!note) return null;
  try {
    storage?.removeItem(RETURN_KEY);
  } catch {
    // ignore
  }
  if (note.list !== list || typeof note.mediaId !== "string" || !(now - note.at <= RETURN_MAX_AGE_MS)) return null;
  const scroll = read<ScrollNote>(storage, SCROLL_KEY);
  const scrollY =
    scroll && scroll.list === list && now - scroll.at <= RETURN_MAX_AGE_MS && Number.isFinite(scroll.scrollY)
      ? scroll.scrollY
      : null;
  return { scrollY, mediaId: note.mediaId };
}
