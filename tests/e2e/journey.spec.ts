/**
 * Definition-of-Done journey on mock providers, in ONE flow:
 * sign up → buy credits → create + consent + train a model → generate from a pack → open → edit →
 * upscale → photo-to-video → zip download → delete the account → signing in again finds nothing.
 */
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { DEFAULT_IDENTITY_SELFIES } from "../fixtures";
import {
  creditBalance,
  expectAcceptedPhotos,
  JOB_TIMEOUT,
  latestEmail,
  linkTo,
  signIn,
  startModel,
  takeConsentSelfie,
  uniqueEmail,
  uploadTrainingPhotos,
  waitForJob,
} from "./support/helpers";

test("journey: sign up → credits → train → create → edit → upscale → video → zip → delete account", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const email = uniqueEmail("journey");

  await test.step("sign up with a magic link", async () => {
    await signIn(page, email);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await creditBalance(page)).toBe(0);
  });

  await test.step("buy credits through the mock checkout", async () => {
    await page.goto("/app/billing");
    const balance = page.getByRole("region", { name: "Plan and credits" });
    await page.getByRole("button", { name: "Buy for $9", exact: true }).click();
    await page.waitForURL(/\/billing\/mock-checkout\?session=/);
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await page.getByRole("button", { name: "Pay $9", exact: true }).click();
    await page.waitForURL(/\/app\/billing\?success=1/);
    await expect(page.getByText("Payment received — thank you!")).toBeVisible();
    await expect(balance.getByText("100", { exact: true })).toBeVisible({ timeout: JOB_TIMEOUT });
    expect(await creditBalance(page)).toBe(100);
    await latestEmail(page.request, email, { template: "receipt" });
  });

  let modelId = "";
  await test.step("create a model: consent selfie + 10 matching photos", async () => {
    modelId = await startModel(page, "Journey me");
    await takeConsentSelfie(page);
    await uploadTrainingPhotos(page, DEFAULT_IDENTITY_SELFIES.slice(0, 10));
    await expectAcceptedPhotos(page, modelId, 10);
    await expect(page.getByText(/weren't saved|wasn't saved/)).toHaveCount(0);
  });

  await test.step("train it (Trained mode, 40 credits) and wait until ready", async () => {
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Train my model · 40 credits" }).click();
    await expect(page.getByRole("heading", { name: "Your model is ready" })).toBeVisible({ timeout: JOB_TIMEOUT });
    expect(await creditBalance(page)).toBe(60);
    await latestEmail(page.request, email, { template: "model_ready" });
  });

  let photoId = "";
  let photoFileUrl = "";
  await test.step("generate 2 photos from a pack", async () => {
    await page.getByRole("link", { name: "Create photos" }).click();
    await page.waitForURL(/\/app\/create\?model=/);
    await page.getByRole("tab", { name: "Pack" }).click();
    await page.getByRole("button", { name: /Photo pack/ }).click();
    await page.getByRole("combobox", { name: "Search packs" }).fill("LinkedIn");
    await page.getByRole("option", { name: /LinkedIn Headshots/ }).click();
    await page.getByRole("radio", { name: /^Standard/ }).click();
    await page.getByRole("radio", { name: "2 photos" }).click();

    const created = page.waitForResponse((r) => r.url().endsWith("/api/jobs") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Generate 2 photos" }).click();
    const { job } = (await (await created).json()) as { job: { id: string } };
    const done = await waitForJob(page, job.id);
    expect(done.status).toBe("succeeded");
    expect(done.media).toHaveLength(2);

    const result = page.getByRole("article", { name: /LinkedIn Headshots/ });
    await expect(result.getByRole("link", { name: "Open gallery" })).toBeVisible({ timeout: JOB_TIMEOUT });
    await expect(result.locator('a[href^="/app/gallery/"]').filter({ has: page.locator("img") })).toHaveCount(2);
    expect(await creditBalance(page)).toBe(58);
  });

  await test.step("open a result", async () => {
    const result = page.getByRole("article", { name: /LinkedIn Headshots/ });
    await result.locator('a[href^="/app/gallery/"]').filter({ has: page.locator("img") }).first().click();
    await page.waitForURL(/\/app\/gallery\/[^/?]+/);
    photoId = new URL(page.url()).pathname.split("/").pop()!;
    await expect(page.getByText("AI-generated", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "View batch" }).or(page.getByRole("link", { name: "LinkedIn Headshots" }))).toBeVisible();
    photoFileUrl = (await page.getByRole("figure").locator("img").getAttribute("src"))!;
    expect((await page.request.get(photoFileUrl)).ok()).toBeTruthy();
  });

  await test.step("edit the background", async () => {
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await page.waitForURL(new RegExp(`/app/edit/${photoId}`));
    await page.getByRole("radio", { name: "Background" }).click();
    await page.getByRole("button", { name: "Modern office" }).click();
    const created = page.waitForResponse((r) => r.url().endsWith("/api/jobs") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Apply edit" }).click();
    const { job } = (await (await created).json()) as { job: { id: string } };
    const done = await waitForJob(page, job.id);
    expect(done.status).toBe("succeeded");
    const results = page.getByRole("region", { name: "Results" });
    await expect(results.getByRole("link", { name: /Edit this result/ })).toHaveCount(1, { timeout: JOB_TIMEOUT });
    await expect(page.getByRole("button", { name: "Show original" })).toBeVisible();
    expect(await creditBalance(page)).toBe(56);
  });

  await test.step("upscale 2×", async () => {
    await page.getByRole("tab", { name: "Enhance" }).click();
    const upscale = page.getByRole("region", { name: "Upscale" });
    const created = page.waitForResponse((r) => r.url().endsWith("/api/jobs") && r.request().method() === "POST");
    await upscale.getByRole("button", { name: "Upscale 2×" }).click();
    const { job } = (await (await created).json()) as { job: { id: string } };
    const done = await waitForJob(page, job.id);
    expect(done.status).toBe("succeeded");
    await expect(upscale.getByRole("img", { name: "Photo upscaled 2×" })).toBeVisible({ timeout: JOB_TIMEOUT });
    expect(await creditBalance(page)).toBe(54);
  });

  await test.step("photo to video", async () => {
    await page.goto(`/app/video?mediaId=${photoId}`);
    const created = page.waitForResponse((r) => r.url().endsWith("/api/jobs") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Make video" }).click();
    const { job } = (await (await created).json()) as { job: { id: string } };
    const done = await waitForJob(page, job.id);
    expect(done.status).toBe("succeeded");
    expect(done.media.some((m) => m.kind === "video")).toBeTruthy();
    await expect(page.getByRole("link", { name: "Open in gallery" })).toBeVisible({ timeout: JOB_TIMEOUT });
    expect(await creditBalance(page)).toBe(44);
  });

  await test.step("download the gallery as a zip", async () => {
    const res = await page.request.get("/api/media?limit=50");
    const { media } = (await res.json()) as { media: { id: string }[] };
    // 2 pack photos + 1 edit + 1 upscale + 1 video (minus any the best-shots picker hid).
    expect(media.length).toBeGreaterThanOrEqual(4);

    await page.goto("/app/gallery");
    await expect(page.locator('a[href^="/app/gallery/"]').filter({ has: page.locator("img") })).toHaveCount(media.length);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.getByRole("button", { name: "Select all" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download/ }).click();
    const file = await (await download).path();
    expect((await download).suggestedFilename()).toMatch(/\.zip$/);
    const entries = Object.keys(unzipSync(new Uint8Array(await readFile(file))));
    expect(entries).toHaveLength(media.length);
  });

  await test.step("delete the account (email confirmation)", async () => {
    await page.goto("/app/settings");
    await page.getByRole("button", { name: "Delete my account…" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your account?" });
    await dialog.getByLabel(/Type DELETE to continue/).fill("DELETE");
    await dialog.getByRole("button", { name: "Email me the confirmation link" }).click();
    await expect(page.getByText("We emailed you a confirmation link")).toBeVisible();

    const mail = await latestEmail(page.request, email, { template: "deletion_confirm_request" });
    await page.goto(linkTo(mail, "/account/delete/confirm"));
    await page.getByRole("button", { name: "Delete my account permanently" }).click();
    await expect(page.getByText("Your account and all data were deleted")).toBeVisible({ timeout: JOB_TIMEOUT });
    await latestEmail(page.request, email, { template: "deletion_completed" });

    expect((await page.request.get("/api/me")).status()).toBe(401);
    expect((await page.request.get(photoFileUrl)).ok()).toBeFalsy();
  });

  await test.step("signing in again finds none of the old data", async () => {
    await signIn(page, email);
    expect(await creditBalance(page)).toBe(0);
    const models = (await (await page.request.get("/api/models")).json()) as { models: unknown[] };
    expect(models.models).toHaveLength(0);
    expect((await page.request.get(`/api/models/${modelId}`)).status()).toBe(404);
    expect((await page.request.get(`/api/media/${photoId}`)).status()).toBe(404);
    const media = (await (await page.request.get("/api/media")).json()) as { media: unknown[] };
    expect(media.media).toHaveLength(0);
    await page.goto("/app/gallery");
    await expect(page.locator('a[href^="/app/gallery/"]').filter({ has: page.locator("img") })).toHaveCount(0);
  });
});
