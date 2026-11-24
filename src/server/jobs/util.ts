/** Small helpers shared by the job engine modules. */

/** True for a Postgres unique-constraint violation (also when wrapped by drizzle's DrizzleQueryError). */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 5; depth++) {
    if (typeof e === "object" && "code" in e && (e as { code?: unknown }).code === "23505") return true;
    e = typeof e === "object" && "cause" in e ? (e as { cause?: unknown }).cause : undefined;
  }
  return false;
}

/** Map with bounded concurrency; results keep input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
