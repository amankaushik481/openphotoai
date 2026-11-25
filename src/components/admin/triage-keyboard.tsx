"use client";

import * as React from "react";

const ITEM = "[data-triage-item]";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

function dialogOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'));
}

/**
 * Keyboard triage for a queue: J / K move between `[data-triage-item]` elements (focusable with
 * tabIndex -1), and a letter clicks the focused item's `[data-shortcut="<letter>"]` button, which opens
 * that action's confirm dialog. When an item leaves the queue, focus moves to the one that took its place.
 */
export function TriageKeyboard({ children, className }: { children: React.ReactNode; className?: string }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const lastIndex = React.useRef(0);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(ITEM));
    const currentItem = () => (document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>(ITEM) : null);

    function focusItem(index: number) {
      const list = items();
      if (list.length === 0) return;
      const target = list[Math.max(0, Math.min(index, list.length - 1))]!;
      target.focus();
      target.scrollIntoView({ block: "nearest" });
    }

    // True while the reviewer works in the queue (or in one of its dialogs, which are portaled outside it).
    let engaged = false;
    function onFocusIn(event: FocusEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;
      if (root!.contains(target)) {
        engaged = true;
        const item = target.closest<HTMLElement>(ITEM);
        if (item) lastIndex.current = items().indexOf(item);
      } else if (!target.closest('[role="dialog"], [role="alertdialog"]')) {
        engaged = false;
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target) || dialogOpen()) return;
      const key = event.key.toLowerCase();
      const item = currentItem();
      if (key === "j" || key === "k") {
        event.preventDefault();
        const index = item ? items().indexOf(item) : key === "j" ? -1 : 1;
        focusItem(index + (key === "j" ? 1 : -1));
        return;
      }
      if (!item || key.length !== 1) return;
      const action = item.querySelector<HTMLElement>(`[data-shortcut="${CSS.escape(key)}"]`);
      if (action && !action.hasAttribute("disabled")) {
        event.preventDefault();
        action.click();
      }
    }

    // A resolved item disappears after the refresh: keep the reviewer's place in the queue.
    const observer = new MutationObserver(() => {
      const active = document.activeElement;
      // Only when focus was lost (the focused item was removed), never to steal it from elsewhere.
      if (!engaged || (active && active !== document.body)) return;
      focusItem(lastIndex.current);
    });
    observer.observe(root, { childList: true, subtree: true });

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}
