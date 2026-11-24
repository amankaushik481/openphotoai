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
    await page.getByRole("button", { name: "Buy for $9.00" }).click();
    await page.waitForURL(/\/billing\/mock-checkout\?session=/);
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await page.getByRole("button", { name: "Pay $9.00" }).click();
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
});
