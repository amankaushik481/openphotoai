/** Server-render smoke tests for the admin pages (seeded PGlite data, mocked session/router). */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import AdminOverviewPage from "@/app/admin/page";
import AdminJobPage from "@/app/admin/jobs/[id]/page";
import AdminJobsPage from "@/app/admin/jobs/page";
import AdminModerationPage from "@/app/admin/moderation/page";
import AdminRevenuePage from "@/app/admin/revenue/page";
import AdminUserPage from "@/app/admin/users/[id]/page";
import AdminUsersPage from "@/app/admin/users/page";
import { BarChart } from "@/components/admin/bar-chart";
import type { UserRow } from "@/db/types";
import { createLocalStorage } from "@/providers/storage/local";
import { listJobs } from "@/server/admin";
import { adminAdjust, debitForJob } from "@/server/credits/ledger";
import { setStorageForTesting } from "@/server/storage";
import { createTestDb, createTestJob, createTestMedia, createTestUser, sessionMock } from "../../helpers/factories";
import { createModerationEvent, createPayment, createReport, createSubscription } from "./fixtures";

// Pages import the session module statically: load the mock lazily (same instance as `sessionMock`).
vi.mock("@/server/auth/session", async () => (await import("../../helpers/session")).sessionMock);
vi.mock("@/server/email", () => ({ sendEmailSafe: vi.fn(async () => null) }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

let tmpDir: string;
beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openshoot-admin-pages-"));
  setStorageForTesting(createLocalStorage({ dir: tmpDir, baseUrl: "http://localhost:3000", secret: "pages-secret" }));
});
afterAll(async () => {
  setStorageForTesting(null);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

let admin: UserRow;
let member: UserRow;

beforeEach(async () => {
  await createTestDb();
  sessionMock.reset();
  admin = await createTestUser({ role: "admin", email: "admin@example.com" });
  member = await createTestUser({ email: "member@example.com", credits: 0 });
  sessionMock.setUser(admin);

  await adminAdjust(admin.id, member.id, 30, "Welcome gift");
  const job = await createTestJob(member.id, {
    status: "failed",
    error: "Provider timed out",
    errorCode: "provider_error",
    creditsCharged: 4,
    costUsd: 0.035,
    submittedAt: new Date(),
  });
  await debitForJob({ userId: member.id, jobId: job.id, amount: 4 });
  const photo = await createTestMedia(member.id, { prompt: "studio portrait" });
  await createReport({ targetUserId: member.id, mediaId: photo.id, details: "Not me" });
  await createModerationEvent({ userId: member.id, kind: "prompt_blocked", details: { excerpt: "bad words" } });
  await createSubscription(member.id, { planId: "starter", interval: "year" });
  await createPayment(member.id, { amountCents: 15000, kind: "subscription", productId: "starter_year" });
});

const search = (params: Record<string, string> = {}) => ({ searchParams: Promise.resolve(params) });

describe("admin pages render", () => {
  it("overview: KPIs, charts with text alternatives and recent failures", async () => {
    const html = renderToStaticMarkup(await AdminOverviewPage(search({ days: "7" })));
    expect(html).toContain("MRR");
    expect(html).toContain("$12.50"); // starter yearly 15000 / 12
    expect(html).toContain("$150.00");
    expect(html).toContain('role="img"');
    expect(html).toContain("Show data table");
    expect(html).toContain("Provider timed out");
    expect(html).toContain("Refund 4");
  });

  it("users list + search", async () => {
    const html = renderToStaticMarkup(await AdminUsersPage(search({ q: "member" })));
    expect(html).toContain("member@example.com");
    expect(html).not.toContain("admin@example.com");
    expect(html).toContain(`/admin/users/${member.id}`);
  });

  it("user detail with actions, ledger and jobs", async () => {
    const html = renderToStaticMarkup(await AdminUserPage({ params: Promise.resolve({ id: member.id }) }));
    expect(html).toContain("Adjust credits");
    expect(html).toContain("Suspend");
    expect(html).toContain("Welcome gift");
    expect(html).toContain("Provider timed out");
    expect(html).toContain("Starter");
  });

  it("an admin's own page offers no suspension", async () => {
    const html = renderToStaticMarkup(await AdminUserPage({ params: Promise.resolve({ id: admin.id }) }));
    expect(html).toContain("Adjust credits");
    expect(html).not.toContain(">Suspend<");
  });

  it("jobs with filters", async () => {
    const html = renderToStaticMarkup(await AdminJobsPage(search({ status: "failed" })));
    expect(html).toContain("Provider timed out");
    expect(html).toContain('<option value="failed" selected="">');
    const invalid = renderToStaticMarkup(await AdminJobsPage(search({ status: "bogus" })));
    expect(invalid).toContain("Some filters were invalid");
  });

  it("job inspector: timing, credits, input and a refund action only once the job has finished", async () => {
    const [failed] = (await listJobs({ status: "failed" })).jobs;
    const html = renderToStaticMarkup(await AdminJobPage({ params: Promise.resolve({ id: failed!.id }) }));
    expect(html).toContain("Generate job");
    expect(html).toContain("Provider timed out");
    expect(html).toContain("studio portrait of {subject}");
    expect(html).toContain("Refund 4");
    const running = await createTestJob(member.id, { status: "running", creditsCharged: 2 });
    const live = renderToStaticMarkup(await AdminJobPage({ params: Promise.resolve({ id: running.id }) }));
    expect(live).not.toContain("Refund 2");
    // The jobs list links every row to the inspector and offers no refund on in-flight jobs.
    const list = renderToStaticMarkup(await AdminJobsPage(search()));
    expect(list).toContain(`/admin/jobs/${running.id}`);
    expect(list).toContain("In progress");
  });

  it("moderation queue with a signed thumbnail and actions", async () => {
    const html = renderToStaticMarkup(await AdminModerationPage());
    expect(html).toContain("Non-consensual image");
    expect(html).toContain("Not me");
    expect(html).toMatch(/<img[^>]+src="http:\/\/localhost:3000\/api\/files\//);
    expect(html).toContain("Remove media");
    expect(html).toContain("Suspend owner");
    expect(html).toContain("Prompt blocked");
    expect(html).toContain("Mark reviewed");
  });

  it("revenue", async () => {
    const html = renderToStaticMarkup(await AdminRevenuePage(search({ days: "30" })));
    expect(html).toContain("MRR by plan");
    expect(html).toContain("starter_year");
    expect(html).toContain("Provider cost vs revenue");
  });
});

describe("BarChart", () => {
  it("draws one column per day, summarizes the data and handles negatives", () => {
    const html = renderToStaticMarkup(
      <BarChart
        id="t"
        title="Net revenue"
        data={[
          { date: "2026-11-22", value: 500 },
          { date: "2026-11-23", value: -200 },
          { date: "2026-11-24", value: 1200, part: 300 },
        ]}
        format={(n) => `${n}`}
        partLabel="Failed"
      />,
    );
    expect(html.match(/<title>/g)).toHaveLength(3);
    expect(html).toContain("total 1500, highest 1200 on Nov 24.");
    expect(html).toContain("<title>Nov 24: 1200 (failed 300)</title>");
    expect(html).not.toContain("NaN");
  });
});
