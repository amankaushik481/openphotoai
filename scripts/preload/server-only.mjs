/**
 * Preload for CLI scripts (tsx): `server-only` throws unless the "react-server" export
 * condition is active (it is inside Next.js). Scripts like the worker legitimately import
 * server modules, so resolve `server-only` to an empty module here.
 * Usage: tsx --import ./scripts/preload/server-only.mjs scripts/worker.ts
 */
import { register } from "node:module";

const hooks = `
export async function resolve(specifier, context, next) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export%20%7B%7D", shortCircuit: true, format: "module" };
  }
  return next(specifier, context);
}`;

register(`data:text/javascript,${encodeURIComponent(hooks)}`, import.meta.url);
