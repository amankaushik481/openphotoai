/** Branding + public, non-secret app settings. Safe to import from client components. */
export const APP = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "OpenShoot",
  url: (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  tagline: "Your AI photographer. Open source.",
  description:
    "Train a private AI model of yourself from 10–30 selfies, then create professional headshots, dating photos, travel shots and videos in minutes. Open source and self-hostable.",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com",
  takedownEmail: process.env.NEXT_PUBLIC_TAKEDOWN_EMAIL || "takedown@example.com",
  legalEntity: process.env.NEXT_PUBLIC_LEGAL_ENTITY || "OpenShoot Operator",
  legalJurisdiction: process.env.NEXT_PUBLIC_LEGAL_JURISDICTION || "Delaware, USA",
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/amankaushik481/openphotoai",
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY || "",
  posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
} as const;

/** Training photo requirements (quality checker + readiness). */
export const TRAINING = {
  minPhotos: 10,
  maxPhotos: 30,
  minSide: 512,
  /** Minimum share of the image the face should cover. */
  minFaceAreaRatio: 0.02,
  /** Minimum adult age (years). Training is refused if any face is estimated younger. */
  minAge: 18,
  /** Extra safety margin on age estimates (estimators are noisy): estimated age must be >= minAge + margin. */
  ageMargin: 2,
} as const;

export const UPLOAD_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  /** Client downsizes images to this max side before upload. */
  clientMaxSide: 2048,
  acceptedMime: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
} as const;
