#!/usr/bin/env node
/**
 * Prints the BETTER_AUTH_SECRET the container should use (docker/entrypoint.sh exports it).
 *
 *   • BETTER_AUTH_SECRET set to a real value  → printed unchanged.
 *   • unset, or a published placeholder value → a random secret generated on first start and
 *     persisted in AUTH_SECRET_FILE (default /data/.auth-secret, mode 600), so sessions survive
 *     restarts and web + worker (sharing the /data volume) sign with the same key.
 *
 * Other weak values (e.g. too short) are printed unchanged: src/lib/env.ts then refuses to start
 * with a clear message instead of silently replacing a secret the operator chose.
 * The placeholder rules mirror weakAuthSecretReason() in src/lib/env.ts (tests/unit/core/auth-secret.test.ts).
 */
import { randomBytes } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const KNOWN_PLACEHOLDER_SECRETS = new Set([
  "dev-insecure-secret-change-me-dev-insecure-secret",
  "INSECURE-docker-compose-dev-secret-set-BETTER_AUTH_SECRET",
]);
const PLACEHOLDER_SECRET_PATTERN = /insecure|change[-_ ]?me|replace[-_ ]?me|placeholder|your[-_ ]?secret|^(.)\1+$/i;
const MIN_LENGTH = 32;

/** True when the value is missing or a known/obvious placeholder (and should be replaced). */
export function isPlaceholderSecret(value) {
  const secret = (value ?? "").trim();
  return !secret || KNOWN_PLACEHOLDER_SECRETS.has(secret) || PLACEHOLDER_SECRET_PATTERN.test(secret);
}

function readSecretFile(file) {
  try {
    const value = readFileSync(file, "utf8").trim();
    return value.length >= MIN_LENGTH ? value : null;
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

/** Read the persisted secret, creating it atomically (O_EXCL) when it doesn't exist yet. */
export function persistedSecret(file) {
  const existing = readSecretFile(file);
  if (existing) return { secret: existing, created: false };
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const secret = randomBytes(32).toString("base64url");
  let fd;
  try {
    fd = openSync(file, "wx", 0o600);
  } catch (err) {
    // Another container created it first: use theirs.
    if (err && err.code === "EEXIST") {
      const raced = readSecretFile(file);
      if (raced) return { secret: raced, created: false };
      throw new Error(`${file} exists but doesn't hold a valid secret; delete it to generate a new one`);
    }
    throw err;
  }
  try {
    writeSync(fd, `${secret}\n`);
  } finally {
    closeSync(fd);
  }
  return { secret, created: true };
}

export function resolveAuthSecret(env = process.env) {
  const current = env.BETTER_AUTH_SECRET?.trim();
  if (!isPlaceholderSecret(current)) return { secret: current, source: "env" };
  const file = env.AUTH_SECRET_FILE?.trim() || "/data/.auth-secret";
  const { secret, created } = persistedSecret(file);
  return { secret, source: created ? "generated" : "file", file, replacedPlaceholder: Boolean(current) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const result = resolveAuthSecret();
    if (result.source !== "env") {
      const what = result.replacedPlaceholder ? "is a published placeholder" : "is not set";
      const how = result.source === "generated" ? "generated a random one and saved it to" : "using the one saved in";
      process.stderr.write(`[entrypoint] BETTER_AUTH_SECRET ${what}: ${how} ${result.file}\n`);
    }
    process.stdout.write(result.secret);
  } catch (err) {
    process.stderr.write(
      `[entrypoint] BETTER_AUTH_SECRET is not set and no secret could be saved (${err instanceof Error ? err.message : err}).\n` +
        "[entrypoint] Set BETTER_AUTH_SECRET (openssl rand -base64 32) or mount a writable volume at /data.\n",
    );
    process.exit(1);
  }
}
