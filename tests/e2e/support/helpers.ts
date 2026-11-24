/**
 * Shared Playwright helpers for the end-to-end journeys (mock providers, dev mailbox, mock checkout).
 * Everything here drives the app the way a user or an API client would: no test-only backdoors.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { FIXTURES_DIR, type SelfieName } from "../../fixtures";

/** Async work (jobs, training, webhooks) on mocks finishes in seconds; give CI some slack. */
export const JOB_TIMEOUT = 60_000;

let counter = 0;

/** Unique, per-run email so every spec (and retry) works with fresh users. */
export function uniqueEmail(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${counter}-${rand}@example.com`;
}

export function selfiePath(name: SelfieName): string {
  return path.join(FIXTURES_DIR, "selfies", `${name}.jpg`);
}

export interface DevEmail {
  id: string;
  to: string;
  template: string;
  subject: string;
  text: string;
  links: string[];
  createdAt: string;
}

/**
 * Newest mocked email to `to` (optionally of one template), polling until it arrives.
 * Pass `after` (an earlier email id) to wait for a newer one.
 */
export async function latestEmail(
  request: APIRequestContext,
  to: string,
  opts: { template?: string; after?: string } = {},
): Promise<DevEmail> {
  const qs = new URLSearchParams({ to });
  if (opts.template) qs.set("template", opts.template);
  let found: DevEmail | null = null;
  await expect
    .poll(
      async () => {
        const res = await request.get(`/api/dev/emails/latest?${qs.toString()}`);
        if (!res.ok()) return null;
        const email = (await res.json()) as DevEmail;
        if (opts.after && email.id === opts.after) return null;
        found = email;
        return email.id;
      },
      { message: `email ${opts.template ?? ""} to ${to}`, timeout: 15_000 },
    )
    .not.toBeNull();
  return found!;
}

/** First link of an email whose path starts with `pathname`. */
export function linkTo(email: DevEmail, pathname: string): string {
  const link = email.links.find((l) => {
    try {
      return new URL(l).pathname.startsWith(pathname);
    } catch {
      return false;
    }
  });
  if (!link) throw new Error(`No ${pathname} link in "${email.subject}": ${email.links.join(", ")}`);
  return link;
}

/** Sign in (or sign up) with a magic link from the dev mailbox. Ends on the dashboard. */
export async function signIn(page: Page, email: string): Promise<void> {
  const before = await page.request.get(`/api/dev/emails/latest?to=${encodeURIComponent(email)}&template=magic_link`);
  const previousId = before.ok() ? ((await before.json()) as DevEmail).id : undefined;

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();

  const mail = await latestEmail(page.request, email, { template: "magic_link", after: previousId });
  await page.goto(linkTo(mail, "/verify"));
  await expect(page.getByText("Confirm sign-in", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /^Sign in to / }).click();
  await page.waitForURL(/\/app(\/|\?|$)/);
}

/** Balance from GET /api/credits as the signed-in user of `page`. */
export async function creditBalance(page: Page): Promise<number> {
  const res = await page.request.get("/api/credits");
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { balance: number }).balance;
}

export interface LedgerEntry {
  delta: number;
  reason: string;
  jobId: string | null;
}

export async function creditLedger(page: Page): Promise<LedgerEntry[]> {
  const res = await page.request.get("/api/credits");
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { ledger: LedgerEntry[] }).ledger;
}

/** Start a mock checkout through the API and pay it (same events as a Stripe webhook). Returns the checkout id. */
export async function buyCreditsViaApi(page: Page, packId = "credits_100"): Promise<string> {
  const res = await page.request.post("/api/billing/checkout", { data: { item: { type: "credit_pack", packId } } });
  expect(res.ok(), await res.text()).toBeTruthy();
  const { url } = (await res.json()) as { url: string };
  const checkoutId = new URL(url, "http://localhost").searchParams.get("session");
  expect(checkoutId).toBeTruthy();
  const paid = await page.request.post("/api/billing/mock/complete", { data: { checkoutId } });
  expect(paid.ok(), await paid.text()).toBeTruthy();
  return checkoutId!;
}

/** Head poses the consent liveness check can ask for (src/lib/liveness.ts) + the frontal shot. */
const CAMERA_POSES = ["frontal", "turn_left", "turn_right", "look_up", "look_down"] as const;

/** `tests/fixtures/liveness/default-<pose>.jpg` as data URLs (identity "default", 960×1280). */
let cameraFrames: Record<string, string> | undefined;
function livenessFrames(): Record<string, string> {
  cameraFrames ??= Object.fromEntries(
    CAMERA_POSES.map((pose) => {
      const bytes = readFileSync(path.join(FIXTURES_DIR, "liveness", `default-${pose}.jpg`));
      return [pose, `data:image/jpeg;base64,${bytes.toString("base64")}`];
    }),
  );
  return cameraFrames;
}

const fakeCameraPages = new WeakSet<Page>();

/**
 * Test-harness camera (no app backdoor): replaces `getUserMedia` in this page with a 960×1280
 * canvas stream showing the frontal fixture, or `default-<step>.jpg` while the consent camera
 * shows liveness step `[data-liveness-step="<step>"]`. Chromium's built-in fake device can't
 * turn its head. Applies from the next navigation on.
 */
export async function installFakeCamera(page: Page): Promise<void> {
  if (fakeCameraPages.has(page)) return;
  fakeCameraPages.add(page);
  await page.addInitScript((frames: Record<string, string>) => {
    const devices = navigator.mediaDevices;
    if (!devices) return;
    const images = Object.fromEntries(
      Object.entries(frames).map(([pose, src]) => {
        const img = new Image();
        img.src = src;
        return [pose, img];
      }),
    );
    devices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      if (!constraints?.video) throw new DOMException("The test camera has video only.", "NotFoundError");
      await Promise.all(Object.values(images).map((img) => img.decode().catch(() => undefined)));
      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 1280;
      const ctx = canvas.getContext("2d")!;
      const draw = () => {
        const step = document.querySelector("[data-liveness-step]")?.getAttribute("data-liveness-step");
        ctx.drawImage((step && images[step]) || images.frontal!, 0, 0, canvas.width, canvas.height);
      };
      draw();
      const timer = window.setInterval(draw, 50);
      const stream = canvas.captureStream(30);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          window.clearInterval(timer);
          stop();
        };
      }
      return stream;
    };
  }, livenessFrames());
}

/** `/app/models/new`: name the model and land on the consent step. Returns the model id. */
export async function startModel(page: Page, name: string): Promise<string> {
  await installFakeCamera(page);
  await page.goto("/app/models/new");
  await page.getByLabel("Model name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/app\/models\/new\?id=/);
  const id = new URL(page.url()).searchParams.get("id");
  expect(id).toBeTruthy();
  return id!;
}

/**
 * Take the live consent selfie with the test camera (identity "default" for the mock face provider):
 * 3 s countdown for the frontal shot, then one guided head movement per liveness step (3 s each).
 * Needs `installFakeCamera` before the page loaded (startModel does it).
 */
export async function takeConsentSelfie(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open camera" }).click();
  const shoot = page.getByRole("button", { name: "Take selfie" });
  await expect(shoot).toBeEnabled();
  await shoot.click();
  await expect(page.locator("[data-liveness-step]")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Use this selfie" }).click({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Add photos of yourself/ })).toBeVisible({ timeout: 15_000 });
}

/** Upload training photos through the wizard dropzone and wait until each one is processed. */
export async function uploadTrainingPhotos(page: Page, names: SelfieName[]): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(names.map(selfiePath));
}

/** Readiness numbers of a model (GET /api/models/:id). */
export async function modelReadiness(page: Page, modelId: string) {
  const res = await page.request.get(`/api/models/${modelId}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as {
    model: { status: string; mode?: string };
    photos: { id: string }[];
    readinessByMode: Record<"instant" | "trained", { accepted: number; canTrain: boolean }>;
  };
}

/** Wait until `count` training photos were accepted. */
export async function expectAcceptedPhotos(page: Page, modelId: string, count: number): Promise<void> {
  await expect
    .poll(async () => (await modelReadiness(page, modelId)).readinessByMode.trained.accepted, {
      message: "accepted training photos",
      timeout: JOB_TIMEOUT,
    })
    .toBe(count);
}

/**
 * A ready Instant model (free, no training) for the signed-in user: name → consent selfie →
 * 3 matching photos → Instant. Returns its id.
 */
export async function createInstantModel(page: Page, name: string, photos: SelfieName[]): Promise<string> {
  const modelId = await startModel(page, name);
  await takeConsentSelfie(page);
  await uploadTrainingPhotos(page, photos);
  await expectAcceptedPhotos(page, modelId, photos.length);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("label").filter({ hasText: "Free · ready in seconds" }).click();
  await page.getByRole("button", { name: "Create Instant model" }).click();
  await expect(page.getByRole("heading", { name: "Your model is ready" })).toBeVisible({ timeout: JOB_TIMEOUT });
  return modelId;
}

export interface JobView {
  id: string;
  status: string;
  creditsCharged: number;
  creditsRefunded: number;
  blockedCount: number;
  error: string | null;
  media: { id: string; kind: string }[];
}

/** Poll GET /api/jobs/:id (which lazily syncs with the provider) until the job is terminal. */
export async function waitForJob(page: Page, jobId: string): Promise<JobView> {
  let job: JobView | null = null;
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/jobs/${jobId}`);
        if (!res.ok()) return `http ${res.status()}`;
        job = ((await res.json()) as { job: JobView }).job;
        return job.status;
      },
      { message: `job ${jobId}`, timeout: JOB_TIMEOUT, intervals: [500, 1000, 1000, 2000] },
    )
    .toMatch(/^(succeeded|failed|blocked|canceled)$/);
  return job!;
}
