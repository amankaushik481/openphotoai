/** Gallery multi-select helpers (pure; unit-tested). */

/** The one id that a single tile toggle added or removed (null when the change wasn't one toggle). */
export function toggledId(before: readonly string[], after: readonly string[]): string | null {
  const a = new Set(before);
  const b = new Set(after);
  const changed = [...after.filter((id) => !a.has(id)), ...before.filter((id) => !b.has(id))];
  return changed.length === 1 ? changed[0]! : null;
}

/**
 * Shift+click: every item between `anchor` and `target` (in list order) takes the target's new state,
 * like a file manager. Falls back to `after` when either end isn't in the list.
 */
export function applyRangeSelection(
  order: readonly string[],
  before: readonly string[],
  after: readonly string[],
  anchor: string | null,
  target: string,
): string[] {
  const from = anchor ? order.indexOf(anchor) : -1;
  const to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...after];
  const [lo, hi] = from < to ? [from, to] : [to, from];
  const range = order.slice(lo, hi + 1);
  const selecting = after.includes(target);
  const next = new Set(before);
  for (const id of range) {
    if (selecting) next.add(id);
    else next.delete(id);
  }
  // Keep list order (zip entries follow the selection order).
  return order.filter((id) => next.has(id)).concat([...next].filter((id) => !order.includes(id)));
}
