import { describe, expect, it } from "vitest";
import { SHORTCUTS, isTypingTarget, matchShortcut } from "@/components/layout/shortcuts";

describe("matchShortcut", () => {
  it("maps single keys and two-key sequences", () => {
    expect(matchShortcut(null, "c")).toEqual({ type: "navigate", href: "/app/create" });
    expect(matchShortcut(null, "C")).toEqual({ type: "navigate", href: "/app/create" });
    expect(matchShortcut(null, "g")).toEqual({ type: "prefix", key: "g" });
    expect(matchShortcut("g", "d")).toEqual({ type: "navigate", href: "/app" });
    expect(matchShortcut("g", "g")).toEqual({ type: "navigate", href: "/app/gallery" });
    expect(matchShortcut("g", "m")).toEqual({ type: "navigate", href: "/app/models" });
    expect(matchShortcut(null, "?")).toEqual({ type: "help" });
  });

  it("ignores unknown keys, and an unknown second key just ends the sequence", () => {
    expect(matchShortcut(null, "x")).toBeNull();
    expect(matchShortcut(null, "Enter")).toBeNull();
    expect(matchShortcut("g", "x")).toBeNull();
    expect(matchShortcut("g", "c")).toEqual({ type: "navigate", href: "/app/create" });
  });

  it("documents every shortcut with an app route or the help action", () => {
    for (const s of SHORTCUTS) {
      expect(s.label.length).toBeGreaterThan(3);
      if (s.href) expect(s.href).toMatch(/^\/app(\/|$)/);
      else expect(s.keys).toEqual(["?"]);
    }
  });
});

describe("isTypingTarget", () => {
  const el = (tagName: string, extra: { isContentEditable?: boolean; role?: string } = {}) => ({
    tagName,
    isContentEditable: extra.isContentEditable ?? false,
    getAttribute: (name: string) => (name === "role" ? (extra.role ?? null) : null),
  });

  it("never fires while the user types or uses a key-driven widget", () => {
    expect(isTypingTarget(el("input"))).toBe(true);
    expect(isTypingTarget(el("TEXTAREA"))).toBe(true);
    expect(isTypingTarget(el("select"))).toBe(true);
    expect(isTypingTarget(el("div", { isContentEditable: true }))).toBe(true);
    expect(isTypingTarget(el("div", { role: "combobox" }))).toBe(true);
    expect(isTypingTarget(el("div", { role: "application" }))).toBe(true);
    expect(isTypingTarget(el("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
