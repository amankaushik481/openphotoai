/**
 * SAF-9 regression: a non-numeric TRAINING.minAge (e.g. `Number(process.env.UNSET)`) must not turn the
 * adults-only hard floor into NaN (where every `age < NaN` check is false and the gate fails open).
 */
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/config/app", async (orig) => {
  const real = (await orig()) as Record<string, unknown> & { TRAINING: Record<string, unknown> };
  return { ...real, TRAINING: { ...real.TRAINING, minAge: Number(process.env.MIN_AGE_UNSET), ageMargin: Number.NaN } };
});
vi.mock("@/providers/registry", async () => (await import("./fixtures")).registryMock);

import { createTestDb, createTestUser } from "../../helpers/db";
import { markedImage, useMockProviders } from "./fixtures";
import { AppError } from "@/server/http";
import { SAFETY_POLICY, verifyConsentSelfie } from "@/server/safety";
import { atLeast } from "@/server/safety/policy";

beforeEach(async () => {
  await createTestDb();
  useMockProviders();
});

it("falls back to the hard floors instead of NaN", () => {
  expect(SAFETY_POLICY.minIdentityAge).toBe(20);
  expect(SAFETY_POLICY.minReferenceAge).toBe(19);
  expect(SAFETY_POLICY.minOutputAge).toBe(20);
  expect(atLeast(18, "21")).toBe(18);
  expect(atLeast(18, Number.POSITIVE_INFINITY)).toBe(18);
  expect(atLeast(18, 25)).toBe(25);
});

it("still refuses a child's consent selfie", async () => {
  const user = await createTestUser();
  const child = await markedImage({ identity: "alice", age: 9, faces: 1 }, 512);
  await expect(verifyConsentSelfie(child, { userId: user.id })).rejects.toBeInstanceOf(AppError);
});
