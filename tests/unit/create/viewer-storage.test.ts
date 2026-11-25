import { afterEach, describe, expect, it, vi } from "vitest";
import { claimViewerStorage, clearViewerStorage } from "@/components/create/use-stored";
import { CREATE_PROMPT_KEY, sessionResultsKey } from "@/components/create/persist";

/** A minimal in-memory Storage. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

function stubBrowser() {
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  vi.stubGlobal("window", { localStorage, sessionStorage });
  return { localStorage, sessionStorage };
}

afterEach(() => vi.unstubAllGlobals());

// Regression: the create page keeps this tab's results and unsent prompt in browser storage. On a
// shared computer the next account to sign in (same tab, Google or magic link) saw the previous
// account's prompt and result cards.
describe("viewer storage is scoped to the signed-in account", () => {
  it("a different account clears the previous account's prompt, results and settings", () => {
    const { localStorage, sessionStorage } = stubBrowser();
    claimViewerStorage("usr_a");
    sessionStorage.setItem(CREATE_PROMPT_KEY, "A's private prompt");
    sessionStorage.setItem(sessionResultsKey("create"), "[]");
    localStorage.setItem("openshoot:create:settings:v1", "{}");
    localStorage.setItem("theme", "dark"); // not ours: untouched

    claimViewerStorage("usr_a"); // same account again: nothing cleared
    expect(sessionStorage.getItem(CREATE_PROMPT_KEY)).toBe("A's private prompt");

    claimViewerStorage("usr_b");
    expect(sessionStorage.getItem(CREATE_PROMPT_KEY)).toBeNull();
    expect(sessionStorage.getItem(sessionResultsKey("create"))).toBeNull();
    expect(localStorage.getItem("openshoot:create:settings:v1")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("sign-out clears every openshoot: key in both storages", () => {
    const { localStorage, sessionStorage } = stubBrowser();
    sessionStorage.setItem(CREATE_PROMPT_KEY, "prompt");
    sessionStorage.setItem("openshoot:gallery-scroll", "120");
    localStorage.setItem("openshoot:create:settings:v1", "{}");
    localStorage.setItem("other-app", "keep");
    clearViewerStorage();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.getItem("openshoot:create:settings:v1")).toBeNull();
    expect(localStorage.getItem("other-app")).toBe("keep");
  });

  it("works without storage (private mode)", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("blocked");
      },
      get sessionStorage(): Storage {
        throw new Error("blocked");
      },
    });
    expect(() => claimViewerStorage("usr_a")).not.toThrow();
    expect(() => clearViewerStorage()).not.toThrow();
  });
});
