/**
 * Dialogs opened from state (no Radix trigger) must hand focus back to whatever opened them:
 * `focusReturnTarget` picks that element when the dialog opens.
 */
import { describe, expect, it } from "vitest";

import { focusReturnTarget } from "@/lib/a11y";

/** Minimal element: `closest('[role="menu"]')` walks up `parent`, `focus` makes it focusable. */
interface FakeEl {
  id?: string;
  role?: string;
  labelledBy?: string;
  parent?: FakeEl;
  focus?: () => void;
  closest(selector: string): FakeEl | null;
  getAttribute(name: string): string | null;
}

function el(props: Omit<FakeEl, "closest" | "getAttribute">): FakeEl {
  const self: FakeEl = {
    focus: () => undefined,
    ...props,
    closest(selector) {
      expect(selector).toBe('[role="menu"]');
      for (let cur: FakeEl | undefined = self; cur; cur = cur.parent) if (cur.role === "menu") return cur;
      return null;
    },
    getAttribute: (name) => (name === "aria-labelledby" ? (props.labelledBy ?? null) : null),
  };
  return self;
}

function doc(active: FakeEl | null, all: FakeEl[] = [], body = el({ focus: undefined })) {
  return {
    activeElement: (active ?? body) as unknown as Element,
    body: body as unknown as Element,
    getElementById: (id: string) => (all.find((e) => e.id === id) ?? null) as unknown as Element | null,
  };
}

describe("focusReturnTarget", () => {
  it("returns the focused button that opens a dialog", () => {
    const share = el({});
    expect(focusReturnTarget(doc(share))).toBe(share);
  });

  it("returns null when nothing has focus", () => {
    expect(focusReturnTarget(doc(null))).toBeNull();
    expect(focusReturnTarget(undefined)).toBeNull();
  });

  it("returns the menu's trigger when a menu item opens the dialog", () => {
    const trigger = el({ id: "radix-trigger" });
    const menu = el({ role: "menu", labelledBy: "radix-trigger" });
    const item = el({ parent: menu });
    expect(focusReturnTarget(doc(item, [trigger]))).toBe(trigger);
  });

  it("climbs out of sub-menus to the top trigger", () => {
    const trigger = el({ id: "top" });
    const menu = el({ role: "menu", labelledBy: "top" });
    const subTrigger = el({ id: "sub", parent: menu });
    const subMenu = el({ role: "menu", labelledBy: "sub" });
    const item = el({ parent: subMenu });
    expect(focusReturnTarget(doc(item, [trigger, subTrigger]))).toBe(trigger);
  });

  it("gives up when the menu's trigger can't be found", () => {
    const item = el({ parent: el({ role: "menu" }) });
    expect(focusReturnTarget(doc(item))).toBeNull();
  });
});
