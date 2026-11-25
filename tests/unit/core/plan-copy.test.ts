/**
 * Plan highlights (pricing page, billing page) must state what the config enforces. "Priority queue"
 * was advertised for Studio although the job engine has no queue priority at all (COR-9).
 */
import { describe, expect, it } from "vitest";
import { PLANS } from "@/config/plans";
import { RATE_LIMITS } from "@/config/rate-limits";

const number = (s: string) => Number(s.replace(/,/g, ""));

describe("plan highlights match the plan config", () => {
  for (const plan of Object.values(PLANS)) {
    it(`${plan.name}`, () => {
      for (const line of plan.highlights) {
        const credits = /^([\d,]+) credits \/ month$/.exec(line);
        if (credits) expect(number(credits[1]!), line).toBe(plan.monthlyCredits);
        const models = /^([\d,]+) identity models?$/.exec(line);
        if (models) expect(number(models[1]!), line).toBe(plan.limits.maxModels);
        const seats = /\((\d+) seats\)/.exec(line);
        if (seats) expect(number(seats[1]!), line).toBe(plan.limits.teamSeats);
        const batch = /^Batch (\d+) in one click$/.exec(line);
        if (batch) expect(number(batch[1]!), line).toBe(plan.limits.maxBatch);
        const jobs = /^(\d+) jobs at once$/.exec(line);
        if (jobs) expect(number(jobs[1]!), line).toBe(plan.limits.maxConcurrentJobs);
        const drafts = /^(\d+) free draft previews \/ day$/.exec(line);
        if (drafts) expect(number(drafts[1]!), line).toBe(plan.id === "free" ? RATE_LIMITS.draftsPerDayFree.limit : RATE_LIMITS.draftsPerDay.limit);
        if (/no watermark/i.test(line)) expect(plan.limits.watermark, line).toBe(false);
        if (/^API access$/.test(line)) expect(plan.limits.apiAccess, line).toBe(true);
        // Features the engine doesn't have.
        expect(line, `${plan.name}: "${line}"`).not.toMatch(/priority|faster queue|dedicated/i);
      }
    });
  }
});
