/** Deferring non-essential work (counters, ingestion) until after the response is sent. */
import { after } from "next/server";

/**
 * Run `task` after the response is sent (`after` from next/server). Outside a request scope (scripts,
 * unit tests rendering a page directly) it runs inline and is awaited. Errors are logged, never thrown.
 */
export async function runAfterResponse(label: string, task: () => Promise<unknown>): Promise<void> {
  const run = () => task().catch((err: unknown) => console.warn(`[after] ${label} failed:`, err));
  try {
    after(run);
  } catch {
    await run();
  }
}
