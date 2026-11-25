import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS, onboardingState } from "@/components/app/onboarding";
import type { ModelStatus } from "@/types/domain";

const model = (id: string, status: ModelStatus, extra: { shared?: boolean; createdAt?: string } = {}) => ({
  id,
  name: id === "m1" ? "Me" : `Model ${id}`,
  status,
  shared: extra.shared ?? false,
  createdAt: extra.createdAt ?? "2026-11-20T10:00:00.000Z",
});

describe("onboardingState", () => {
  it("renders nothing while models load", () => {
    expect(onboardingState(undefined, undefined)).toBeNull();
  });

  it("starts with creating a model", () => {
    expect(onboardingState([], false)).toMatchObject({
      current: 0,
      step: "model",
      model: null,
      cta: { href: "/app/models/new", label: "Create your model" },
    });
    // Models shared by friends are for Together photos: they don't replace your own.
    expect(onboardingState([model("f1", "ready", { shared: true })], false)?.step).toBe("model");
  });

  // Regression: once any model existed the dashboard dropped its "Create your model" card, so a model
  // left half set up (no consent selfie, too few photos) had no way back from the dashboard.
  it("resumes a model that is still being set up", () => {
    expect(onboardingState([model("m1", "awaiting_consent")], false)).toMatchObject({
      current: 0,
      cta: { href: "/app/models/new?id=m1", label: "Continue setting up Me" },
      status: "Me needs its consent selfie.",
    });
    expect(onboardingState([model("m1", "collecting")], false)).toMatchObject({ current: 1, step: "photos" });
    expect(onboardingState([model("m1", "failed")], false)?.status).toMatch(/didn't finish \(credits refunded\)/);
  });

  it("follows training, then points to the first shoot", () => {
    expect(onboardingState([model("m1", "training")], false)).toMatchObject({
      current: 2,
      step: "train",
      cta: { href: "/app/models/m1" },
    });
    expect(onboardingState([model("m1", "ready")], false)).toMatchObject({
      current: 3,
      step: "create",
      cta: { href: "/app/create?model=m1", label: "Create your first photos" },
    });
  });

  it("is done once a ready model has made photos (or while media is unknown)", () => {
    expect(onboardingState([model("m1", "ready")], true)).toBeNull();
    expect(onboardingState([model("m1", "ready")], undefined)).toBeNull();
  });

  it("prefers the most advanced, then the newest model", () => {
    const models = [
      model("old", "collecting", { createdAt: "2026-11-01T00:00:00.000Z" }),
      model("new", "awaiting_consent", { createdAt: "2026-11-10T00:00:00.000Z" }),
    ];
    expect(onboardingState(models, false)?.model?.id).toBe("new");
    expect(onboardingState([...models, model("t", "training")], false)?.model?.id).toBe("t");
    expect(onboardingState([model("gone", "deleting")], false)?.step).toBe("model");
  });

  it("has one entry per step", () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual(["model", "photos", "train", "create"]);
  });
});
