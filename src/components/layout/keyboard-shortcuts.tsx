"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { OPEN_SHORTCUTS_EVENT, SHORTCUTS, isTypingTarget, matchShortcut } from "@/components/layout/shortcuts";

/** How long the second key of a "g then x" sequence may take. */
const SEQUENCE_MS = 1200;

/** App-wide single-key shortcuts (c, g d, g p…, ?) and their help dialog. Ignored while typing. */
export function KeyboardShortcuts() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let prefix: string | null = null;
    let timer: number | undefined;
    const reset = () => {
      prefix = null;
      window.clearTimeout(timer);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (isTypingTarget(e.target as HTMLElement | null)) return;
      // Leave dialogs, menus and other overlays their own keys.
      if (document.querySelector("[role=dialog], [role=menu], [role=listbox]")) return;
      const result = matchShortcut(prefix, e.key);
      reset();
      if (!result) return;
      if (result.type === "prefix") {
        prefix = result.key;
        timer = window.setTimeout(reset, SEQUENCE_MS);
        return;
      }
      e.preventDefault();
      if (result.type === "help") setOpen(true);
      else router.push(result.href);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, onOpen);
    return () => {
      reset();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_SHORTCUTS_EVENT, onOpen);
    };
  }, [router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Press these anywhere in the app, outside text fields.</DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col gap-2 text-sm">
          {SHORTCUTS.map((s) => (
            <div key={s.keys.join("+")} className="flex items-center justify-between gap-4">
              <dt>{s.label}</dt>
              <dd className="flex items-center gap-1 text-xs text-muted-foreground">
                {s.keys.map((k, i) => (
                  <React.Fragment key={`${k}-${i}`}>
                    {i > 0 && <span>then</span>}
                    <Kbd>{k.toUpperCase()}</Kbd>
                  </React.Fragment>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
