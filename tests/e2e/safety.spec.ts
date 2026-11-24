/**
 * Safety rules end to end (mock face + moderation providers, see src/providers/mock/*):
 * consent face match, adults only, prompt filter, output classifier + refund, multi-person consent.
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
  linkTo,
  modelReadiness,
  signIn,
  startModel,
  takeConsentSelfie,
  uniqueEmail,
  uploadTrainingPhotos,
  waitForJob,
} from "./support/helpers";

const MY_PHOTOS = DEFAULT_IDENTITY_SELFIES.slice(0, 3);

test("training photos of someone else or of a minor are rejected and never stored", async ({ page }) => {
  await signIn(page, uniqueEmail("safety-photos"));
  const modelId = await startModel(page, "Safety me");
  await takeConsentSelfie(page);

  const notSaved = page.getByRole("region", { name: /wasn't saved|weren't saved/ });

  await test.step("a different person (face mismatch)", async () => {
    await uploadTrainingPhotos(page, ["bob-01"]);
    await expect(notSaved.getByText("This doesn't look like the person in your consent selfie.")).toBeVisible({
      timeout: JOB_TIMEOUT,
    });
  });

  await test.step("someone under 18", async () => {
    await uploadTrainingPhotos(page, ["teen-01"]);
    await expect(notSaved.getByText("This photo looks like it may show someone under 18.")).toBeVisible({
      timeout: JOB_TIMEOUT,
    });
  });

  await expect(notSaved.getByRole("heading", { name: "2 photos weren't saved" })).toBeVisible();
  const detail = await modelReadiness(page, modelId);
  expect(detail.photos).toHaveLength(0);

  await test.step("photos of the consenting person are accepted", async () => {
    await uploadTrainingPhotos(page, [MY_PHOTOS[0]]);
    await expect.poll(async () => (await modelReadiness(page, modelId)).photos.length, { timeout: JOB_TIMEOUT }).toBe(1);
  });
});

test("explicit prompts are blocked for free; blocked outputs are refunded", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, uniqueEmail("safety-gen"));
  await buyCreditsViaApi(page, "credits_100");
  const modelId = await createInstantModel(page, "Safety gen", MY_PHOTOS);
  expect(await creditBalance(page)).toBe(100);

  await page.goto(`/app/create?model=${modelId}`);
  const prompt = page.getByLabel("Describe your photo");
  const generate = page.getByRole("button", { name: /^Generate 1 photo$/ });
  await page.getByRole("radio", { name: /^Standard/ }).click();
  await page.getByRole("radio", { name: "1 photo", exact: true }).click();

  await test.step("an explicit prompt is refused before any charge", async () => {
    await prompt.fill("a nude photo of me on the beach");
    await generate.click();
    await expect(page.getByText("Blocked by our safety rules")).toBeVisible();
    expect(await creditBalance(page)).toBe(100);
    const ledger = await creditLedger(page);
    expect(ledger.filter((e) => e.reason !== "purchase")).toHaveLength(0);
    const jobs = (await (await page.request.get("/api/jobs")).json()) as { jobs: unknown[] };
    expect(jobs.jobs).toHaveLength(0);
  });

  await test.step("an explicit output is blocked, discarded and refunded", async () => {
    await page.getByRole("button", { name: "Dismiss" }).click().catch(() => undefined);
    await prompt.fill("me in a cafe, candid portrait [mock:unsafe-output]");
    const created = page.waitForResponse((r) => r.url().endsWith("/api/jobs") && r.request().method() === "POST");
    await generate.click();
    const res = await created;
    expect(res.ok(), await res.text()).toBeTruthy();
    const { job } = (await res.json()) as { job: { id: string; creditsCharged: number } };
    // Instant models cost 2× per standard photo.
    expect(job.creditsCharged).toBe(2);

    const done = await waitForJob(page, job.id);
    expect(done.status).toBe("blocked");
    expect(done.media).toHaveLength(0);
    expect(done.creditsRefunded).toBe(2);
    expect(await creditBalance(page)).toBe(100);

    const ledger = await creditLedger(page);
    expect(ledger.find((e) => e.reason === "job_debit" && e.jobId === job.id)?.delta).toBe(-2);
    expect(ledger.find((e) => e.reason === "job_refund" && e.jobId === job.id)?.delta).toBe(2);

    await page.goto("/app/billing");
    const history = page.getByRole("table");
    await expect(history.getByRole("row").filter({ hasText: "Refund" }).filter({ hasText: "+2" })).toBeVisible();
    await expect(history.getByRole("row").filter({ hasText: "Used" }).filter({ hasText: "−2" })).toBeVisible();
    const media = (await (await page.request.get("/api/media?showHidden=true")).json()) as { media: unknown[] };
    expect(media.media).toHaveLength(0);
  });
});

test("using another person's model needs their accepted invite", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const friendEmail = uniqueEmail("safety-friend");
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();

  const [myModel, friendModel] = await Promise.all([
    (async () => {
      await signIn(page, uniqueEmail("safety-owner"));
      await buyCreditsViaApi(page, "credits_100");
      return createInstantModel(page, "Owner me", MY_PHOTOS);
    })(),
    (async () => {
      await signIn(friend, friendEmail);
      return createInstantModel(friend, "Friend me", DEFAULT_IDENTITY_SELFIES.slice(3, 6));
    })(),
  ]);

  const together = { type: "multi_person", modelIds: [myModel, friendModel], prompt: "two friends hiking at sunset", numImages: 1 };

  await test.step("without consent the job is refused (403) and nothing is charged", async () => {
    const res = await page.request.post("/api/jobs", { data: together });
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("forbidden");
    expect(body.error.message).toMatch(/consent/i);
    expect(await creditBalance(page)).toBe(100);
  });

  await test.step("invite the friend; they accept and share their model", async () => {
    await page.goto("/app/together");
    await page.getByLabel("Their email").fill(friendEmail);
    await page.getByRole("button", { name: "Send invite" }).click();

    const invite = await latestEmail(friend.request, friendEmail, { template: "multi_person_invite" });
    await friend.goto(linkTo(invite, "/invites/"));
    await expect(friend.getByText("wants to take photos with you")).toBeVisible();
    // Their only ready model is preselected.
    await expect(friend.getByRole("radio", { name: /Friend me/ })).toBeChecked();
    await friend.getByRole("button", { name: "Accept and share" }).click();
    await expect(friend.getByRole("status").filter({ hasText: "You're sharing “Friend me”" })).toBeVisible();
  });

  await test.step("with consent the together photo is created", async () => {
    const res = await page.request.post("/api/jobs", { data: together });
    expect(res.status(), await res.text()).toBe(200);
    const { job } = (await res.json()) as { job: { id: string } };
    const done = await waitForJob(page, job.id);
    expect(done.status).toBe("succeeded");
    expect(done.media.length).toBeGreaterThan(0);
  });

  await friendContext.close();
});
