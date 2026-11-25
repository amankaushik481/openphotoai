import { describe, expect, it } from "vitest";

import { CREDIT_COSTS, DRAFT_DAILY_LIMIT, DRAFT_DAILY_LIMIT_FREE } from "@/config/credits";
import { CREDIT_PACKS, PAID_PLAN_IDS, PLANS } from "@/config/plans";
import {
  COMPARISON_PLAN_IDS,
  CREDIT_COST_GROUPS,
  creditCostRows,
  creditExamples,
  creditPriceRangeCents,
  formatCents,
  formatCreditCost,
  planComparisonRows,
  providerCostExamples,
} from "@/content/credit-costs";

describe("credit cost table", () => {
  it("has exactly one row per CREDIT_COSTS entry with the same credits", () => {
    const rows = creditCostRows();
    const keys = Object.keys(CREDIT_COSTS).sort();
    expect(rows.map((r) => r.key).sort()).toEqual(keys);
    for (const row of rows) expect(row.credits).toBe(CREDIT_COSTS[row.key]);
  });

  it("labels every row and assigns it to a known group, in group order", () => {
    const rows = creditCostRows();
    const groups = CREDIT_COST_GROUPS.map((g) => g.id);
    for (const row of rows) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.unit.length).toBeGreaterThan(0);
      expect(groups).toContain(row.group);
    }
    const order = rows.map((r) => groups.indexOf(r.group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("formats costs for humans", () => {
    expect(formatCreditCost(0)).toBe("Free");
    expect(formatCreditCost(1)).toBe("1 credit");
    expect(formatCreditCost(1500)).toBe("1,500 credits");
    expect(formatCents(4.125)).toBe("4.1¢");
    expect(formatCents(9)).toBe("9¢");
  });

  it("computes the price range of one credit across plans and packs", () => {
    const { min, max } = creditPriceRangeCents();
    const all = [
      ...PAID_PLAN_IDS.map((id) => PLANS[id].monthlyPriceCents / PLANS[id].monthlyCredits),
      ...CREDIT_PACKS.map((p) => p.priceCents / p.credits),
    ];
    expect(min).toBeGreaterThan(0);
    expect(min).toBeLessThanOrEqual(Math.min(...all));
    expect(max).toBe(Math.max(...all));
  });

  it("provides provider cost examples that match the configured credit costs", () => {
    const examples = providerCostExamples();
    expect(examples.length).toBeGreaterThan(0);
    const standard = examples.find((e) => e.label === "Standard photo")!;
    expect(standard.credits).toBe(CREDIT_COSTS.generateStandard);
    for (const e of examples) expect(e.providerUsd).toBeGreaterThan(0);
  });
});

describe("what credits buy", () => {
  it("divides the budget by each configured cost", () => {
    const examples = creditExamples(100);
    const standard = examples.find((e) => e.key === "generateStandard")!;
    expect(standard.count).toBe(Math.floor(100 / CREDIT_COSTS.generateStandard));
    const video = examples.find((e) => e.key === "video5s")!;
    expect(video.count).toBe(Math.floor(100 / CREDIT_COSTS.video5s));
    for (const e of examples) {
      expect(e.credits).toBe(CREDIT_COSTS[e.key]);
      expect(e.count).toBeGreaterThan(0);
    }
  });

  it("leaves out actions the budget can't cover", () => {
    expect(creditExamples(CREDIT_COSTS.train - 1).some((e) => e.key === "train")).toBe(false);
    expect(creditExamples(0)).toEqual([]);
  });
});

describe("plan comparison", () => {
  const rows = planComparisonRows();
  const row = (label: string) => rows.find((r) => r.label === label)!;

  it("has a value for every plan in every row", () => {
    expect(COMPARISON_PLAN_IDS).toEqual(["free", ...PAID_PLAN_IDS]);
    for (const r of rows) for (const id of COMPARISON_PLAN_IDS) expect(r.values[id]).toBeDefined();
  });

  it("reflects the enforced plan limits", () => {
    for (const id of COMPARISON_PLAN_IDS) {
      const plan = PLANS[id];
      expect(row("Identity models").values[id]).toBe(String(plan.limits.maxModels));
      expect(row("Photos per batch").values[id]).toBe(String(plan.limits.maxBatch));
      expect(row("Jobs at once").values[id]).toBe(String(plan.limits.maxConcurrentJobs));
      expect(row("API access").values[id]).toBe(plan.limits.apiAccess);
      expect(row("No watermark").values[id]).toBe(!plan.limits.watermark);
      expect(row("Team seats").values[id]).toBe(plan.limits.teamSeats > 0 ? String(plan.limits.teamSeats) : false);
    }
  });

  it("shows prices, credits and draft allowances from config", () => {
    expect(row("Price per month").values.pro).toBe(`$${PLANS.pro.monthlyPriceCents / 100}`);
    expect(row("Credits every month").values.studio).toBe(PLANS.studio.monthlyCredits.toLocaleString("en-US"));
    expect(row("Credits every month").values.free).toBe("—");
    expect(row("Price per credit").values.starter).toBe(
      formatCents(PLANS.starter.monthlyPriceCents / PLANS.starter.monthlyCredits),
    );
    expect(row("Free drafts a day").values.free).toBe(String(DRAFT_DAILY_LIMIT_FREE));
    expect(row("Free drafts a day").values.pro).toBe(String(DRAFT_DAILY_LIMIT));
  });
});
