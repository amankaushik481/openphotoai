/**
 * Small client-side accessibility helpers shared by UI components.
 */

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
