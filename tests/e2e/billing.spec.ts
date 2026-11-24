/**
 * Billing on the mock payment provider: subscription checkout (idempotent credit grant) and
 * automatic refunds for failed jobs.
 */
import { expect, test } from "@playwright/test";
import { DEFAULT_IDENTITY_SELFIES } from "../fixtures";
import {
  buyCreditsViaApi,
  creditBalance,
  creditLedger,
  createInstantModel,
  JOB_TIMEOUT,
  latestEmail,
  signIn,
  uniqueEmail,
  waitForJob,
} from "./support/helpers";

test("Pro subscription via mock checkout grants its credits exactly once", async ({ page }) => {
  const email = uniqueEmail("billing-sub");
  await signIn(page, email);

  await page.goto("/app/billing");
  await page.getByRole("button", { name: "Upgrade to Pro" }).click();
  await page.waitForURL(/\/billing\/mock-checkout\?session=/);
  const checkoutId = new URL(page.url()).searchParams.get("session")!;
  await expect(page.getByText("600 credits every month")).toBeVisible();
  await page.getByRole("button", { name: "Pay $39", exact: true }).click();
  await page.waitForURL(/\/app\/billing\?success=1/);

  const plan = page.getByRole("region", { name: "Plan and credits" });
  await expect(plan.getByText("Pro", { exact: true })).toBeVisible({ timeout: JOB_TIMEOUT });
  await expect(plan.getByText("600", { exact: true })).toBeVisible();
  expect(await creditBalance(page)).toBe(600);
  await latestEmail(page.request, email, { template: "receipt" });

  // Replaying the completion (the same signed provider events) changes nothing.
  for (let i = 0; i < 2; i++) {
    const replay = await page.request.post("/api/billing/mock/complete", { data: { checkoutId } });
    expect(replay.ok(), await replay.text()).toBeTruthy();
  }
  expect(await creditBalance(page)).toBe(600);
  const grants = (await creditLedger(page)).filter((e) => e.reason === "subscription_grant");
  expect(grants).toHaveLength(1);
  expect(grants[0]!.delta).toBe(600);

  const summary = (await (await page.request.get("/api/billing/subscription")).json()) as {
    plan: string;
    subscription: { status: string } | null;
  };
  expect(summary.plan).toBe("pro");
  expect(summary.subscription?.status).toBe("active");

  await page.reload();
  await expect(plan.getByText("Pro", { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByRole("row").filter({ hasText: "Plan credits" })).toHaveCount(1);
});

test("a failed job is refunded automatically", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, uniqueEmail("billing-refund"));
  await buyCreditsViaApi(page, "credits_100");
  const modelId = await createInstantModel(page, "Refund me", DEFAULT_IDENTITY_SELFIES.slice(0, 3));

  await page.goto(`/app/create?model=${modelId}`);
  await page.getByRole("radio", { name: /^Standard/ }).click();
  await page.getByRole("radio", { name: "1 photo", exact: true }).click();
  await page.getByLabel("Describe your photo").fill("me at a rooftop party [mock:fail]");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/jobs") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Generate 1 photo" }).click();
  const res = await created;
  expect(res.ok(), await res.text()).toBeTruthy();
  const { job } = (await res.json()) as { job: { id: string; creditsCharged: number } };
  expect(job.creditsCharged).toBe(2);

  const done = await waitForJob(page, job.id);
  expect(done.status).toBe("failed");
  expect(done.creditsRefunded).toBe(2);
  await expect(page.getByText(/2 credits (were )?refunded/i).first()).toBeVisible({ timeout: JOB_TIMEOUT });
  expect(await creditBalance(page)).toBe(100);

  const ledger = await creditLedger(page);
  expect(ledger.find((e) => e.reason === "job_debit" && e.jobId === job.id)?.delta).toBe(-2);
  expect(ledger.find((e) => e.reason === "job_refund" && e.jobId === job.id)?.delta).toBe(2);

  await page.goto("/app/billing");
  const history = page.getByRole("table");
  await expect(history.getByRole("row").filter({ hasText: "Refund" }).filter({ hasText: "+2" })).toBeVisible();
});
