/**
 * Small client-side accessibility helpers shared by UI components.
 */
import * as React from "react";

/**
 * Callback ref that moves focus to the element when it mounts. Use on the `tabIndex={-1}` title of a
 * view that replaces the control the user just activated, so focus isn't lost to `<body>` and the new
 * title is announced.
 */
export function focusOnMount(el: HTMLElement | null): void {
  el?.focus();
}

/** `"smooth"` unless the user asked for reduced motion (CSS can't reach `scrollIntoView` options). */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/** The parts of `Document` that `focusReturnTarget` reads (structural, so it is testable without a DOM). */
interface FocusDocument {
  activeElement: Element | null;
  body: Element | null;
  getElementById(id: string): Element | null;
}

/**
 * Where focus should go back when an overlay that is opening now closes again: the element that has
 * focus while it opens or, when that is an item of a menu (which closes as the overlay opens), the button
 * that opened the menu. `null` when nothing useful has focus.
 */
export function focusReturnTarget(doc: FocusDocument | undefined = globalThis.document): HTMLElement | null {
  const active = doc?.activeElement;
  if (!doc || !active || active === doc.body) return null;
  let el: Element = active;
  for (let depth = 0; depth < 4; depth++) {
    const menu: Element | null = el.closest('[role="menu"]');
    if (!menu) break;
    // Radix menus are labelled by their trigger (also for sub-menus, whose trigger is an item).
    const triggerId: string | null = menu.getAttribute("aria-labelledby");
    const trigger: Element | null = triggerId ? doc.getElementById(triggerId) : null;
    if (!trigger) return null;
    el = trigger;
  }
  return typeof (el as HTMLElement).focus === "function" ? (el as HTMLElement) : null;
}

/**
 * `onOpenAutoFocus` / `onCloseAutoFocus` for Radix dialog content that return focus to the opener.
 *
 * Radix only returns focus to its own `<Dialog.Trigger>`; dialogs opened from state (a button's onClick,
 * a menu item) have none, so focus fell back to `<body>` on close. The opener is remembered when the
 * dialog opens; when the caller's close handler prevents the default, or the opener is gone, Radix's
 * own behavior applies.
 */
export function useReturnFocus({
  onOpenAutoFocus,
  onCloseAutoFocus,
}: {
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
}): { onOpenAutoFocus: (event: Event) => void; onCloseAutoFocus: (event: Event) => void } {
  const opener = React.useRef<HTMLElement | null>(null);
  const onOpen = React.useCallback(
    (event: Event) => {
      opener.current = focusReturnTarget();
      onOpenAutoFocus?.(event);
    },
    [onOpenAutoFocus],
  );
  const onClose = React.useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event);
      const target = opener.current;
      opener.current = null;
      if (event.defaultPrevented || !target?.isConnected) return;
      event.preventDefault();
      target.focus();
    },
    [onCloseAutoFocus],
  );
  return { onOpenAutoFocus: onOpen, onCloseAutoFocus: onClose };
}
