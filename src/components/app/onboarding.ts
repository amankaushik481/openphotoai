/**
 * First-run guidance on the dashboard: where the user stands on the path
 * create a model → consent selfie → photos → Instant / Trained → first photos.
 * Pure (unit-tested); the card that renders it lives in dashboard-overview.tsx.
 */
import type { IdentityModelDTO } from "@/types/domain";

export type OnboardingStepId = "model" | "photos" | "train" | "create";

export const ONBOARDING_STEPS: readonly { id: OnboardingStepId; title: string; body: string }[] = [
  { id: "model", title: "Name it + consent selfie", body: "A 20-second live selfie so only you can make a model of you." },
  { id: "photos", title: "Add your photos", body: "3+ for Instant, 10–30 for the best likeness. We check each one." },
  { id: "train", title: "Instant or Trained", body: "Instant is free and ready in seconds; Trained takes about 20 minutes." },
  { id: "create", title: "Your first photos", body: "Start with free drafts, keep the shots you love." },
];

export interface OnboardingState {
  /** The step to do next (index into ONBOARDING_STEPS). */
  current: number;
  step: OnboardingStepId;
  /** The model being set up (null before the first one exists). */
  model: Pick<IdentityModelDTO, "id" | "name" | "status"> | null;
  cta: { href: string; label: string };
  /** One line about where things stand, e.g. "Me is training: we'll email you." */
  status: string | null;
}

const SETUP: ReadonlySet<string> = new Set(["awaiting_consent", "collecting", "failed"]);

const byNewest = (a: { createdAt: string }, b: { createdAt: string }) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

/**
 * The next step of the first-run path, or null once it's done (a ready model and at least one photo
 * created). Only the user's own models count; shared ones are for Together photos.
 */
export function onboardingState(
  models: readonly Pick<IdentityModelDTO, "id" | "name" | "status" | "shared" | "createdAt">[] | undefined,
  hasMedia: boolean | undefined,
): OnboardingState | null {
  if (!models) return null; // still loading: render nothing rather than a flash of the wrong step
  const own = models.filter((m) => !m.shared && m.status !== "deleting");
  const ready = own.filter((m) => m.status === "ready").sort(byNewest)[0];
  if (ready) {
    if (hasMedia !== false) return null; // loading or done
    return {
      current: 3,
      step: "create",
      model: ready,
      cta: { href: `/app/create?model=${ready.id}`, label: "Create your first photos" },
      status: `${ready.name} is ready.`,
    };
  }
  const training = own.filter((m) => m.status === "training").sort(byNewest)[0];
  if (training) {
    return {
      current: 2,
      step: "train",
      model: training,
      cta: { href: `/app/models/${training.id}`, label: "See training progress" },
      status: `${training.name} is training. We'll email you when it's ready.`,
    };
  }
  const setup = own.filter((m) => SETUP.has(m.status)).sort(byNewest)[0];
  if (setup) {
    const needsConsent = setup.status === "awaiting_consent";
    return {
      current: needsConsent ? 0 : 1,
      step: needsConsent ? "model" : "photos",
      model: setup,
      cta: { href: `/app/models/new?id=${setup.id}`, label: `Continue setting up ${setup.name}` },
      status:
        setup.status === "failed"
          ? `Training ${setup.name} didn't finish (credits refunded). Check the photos and try again.`
          : needsConsent
            ? `${setup.name} needs its consent selfie.`
            : `${setup.name} needs a few more photos.`,
    };
  }
  return {
    current: 0,
    step: "model",
    model: null,
    cta: { href: "/app/models/new", label: "Create your model" },
    status: null,
  };
}
