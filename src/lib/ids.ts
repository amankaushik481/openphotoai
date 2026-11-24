import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const gen = customAlphabet(alphabet, 20);
const tokenGen = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 32);

/** Prefixed, URL-safe, sortable-enough id, e.g. newId("job") -> "job_k3j9...". */
export function newId(prefix: string): string {
  return `${prefix}_${gen()}`;
}

/** High-entropy random token for share links, invites, deletion confirmations. */
export function newToken(length = 32): string {
  return length === 32 ? tokenGen() : customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", length)();
}

/** Identity trigger word: rare token unlikely to collide with real words. */
export function newTriggerWord(): string {
  return `ohwx${customAlphabet("abcdefghjkmnpqrstuvwxyz", 6)()}`;
}
