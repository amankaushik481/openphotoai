/** Request helpers for the admin routes. */
import type { ZodType } from "zod";
import { errors } from "@/server/http";

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/** Optional `Idempotency-Key` header (printable ASCII, ≤ 128 chars). */
export function idempotencyKeyFrom(req: Request): string | null {
  const key = req.headers.get("idempotency-key")?.trim();
  if (!key) return null;
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH || !/^[\x21-\x7e]+$/.test(key)) {
    throw errors.validation(`Idempotency-Key must be 1-${MAX_IDEMPOTENCY_KEY_LENGTH} printable ASCII characters.`);
  }
  return key;
}

/** Like parseBody, but an empty body is validated as `{}` (for endpoints whose fields are all optional). */
export async function parseOptionalBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const text = await req.text();
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw errors.validation("Body must be valid JSON.");
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw errors.validation("Invalid request body.", parsed.error.issues);
  return parsed.data;
}
