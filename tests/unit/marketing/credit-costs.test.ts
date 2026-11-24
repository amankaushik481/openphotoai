import { describe, expect, it } from "vitest";

import { CREDIT_COSTS } from "@/config/credits";
import { CREDIT_PACKS, PAID_PLAN_IDS, PLANS } from "@/config/plans";
import {
  CREDIT_COST_GROUPS,
  creditCostRows,
  creditPriceRangeCents,
  formatCents,
  formatCreditCost,
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
