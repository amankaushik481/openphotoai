/** App keyboard shortcuts (pure: the key handling lives in keyboard-shortcuts.tsx). */

/** Window event that opens the shortcuts dialog (fired by the user menu's "Keyboard shortcuts"). */
export const OPEN_SHORTCUTS_EVENT = "openshoot:shortcuts";

export interface ShortcutDef {
  /** Keys in order, e.g. ["g", "d"]. */
  keys: readonly string[];
  label: string;
  href?: string;
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  { keys: ["c"], label: "Create photos", href: "/app/create" },
  { keys: ["g", "d"], label: "Go to dashboard", href: "/app" },
  { keys: ["g", "p"], label: "Go to packs", href: "/app/packs" },
  { keys: ["g", "m"], label: "Go to models", href: "/app/models" },
  { keys: ["g", "g"], label: "Go to gallery", href: "/app/gallery" },
  { keys: ["g", "b"], label: "Go to billing", href: "/app/billing" },
  { keys: ["g", "s"], label: "Go to settings", href: "/app/settings" },
  { keys: ["?"], label: "Show keyboard shortcuts" },
];

export type ShortcutResult =
  { type: "navigate"; href: string } | { type: "help" } | { type: "prefix"; key: string } | null;

/** What a key press does after `prefix` (the pending first key of a sequence, if any). */
export function matchShortcut(prefix: string | null, key: string): ShortcutResult {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (prefix) {
    const hit = SHORTCUTS.find((s) => s.keys.length === 2 && s.keys[0] === prefix && s.keys[1] === k);
    if (hit?.href) return { type: "navigate", href: hit.href };
    // An unknown second key cancels the sequence; it may start a new one.
  }
  if (key === "?") return { type: "help" };
  const single = SHORTCUTS.find((s) => s.keys.length === 1 && s.keys[0] === k && s.href);
  if (single?.href) return { type: "navigate", href: single.href };
  if (SHORTCUTS.some((s) => s.keys.length === 2 && s.keys[0] === k)) return { type: "prefix", key: k };
  return null;
}

/** Keys typed into fields, editable content or widgets that use letters must never trigger shortcuts. */
export function isTypingTarget(
  target: { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null } | null,
): boolean {
  if (!target) return false;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  const role = target.getAttribute?.("role");
  return role === "textbox" || role === "combobox" || role === "searchbox" || role === "application";
}

/**
 * Open overlays that own their keys: dialogs, confirm dialogs (Radix AlertDialog renders
 * role="alertdialog"), menus and listboxes. Global shortcuts stay quiet while one is open.
 */
export const OVERLAY_SELECTOR = "[role=dialog], [role=alertdialog], [role=menu], [role=listbox]";

export function isOverlayOpen(doc: Pick<Document, "querySelector">): boolean {
  return doc.querySelector(OVERLAY_SELECTOR) !== null;
}
