import { describe, expect, it } from "vitest";
import { TYPICAL_TRAINING_MINUTES, trainingEta } from "@/components/models/training-eta";

const T0 = Date.parse("2026-11-25T10:00:00.000Z");
const at = (minutes: number) => T0 + minutes * 60_000;
const job = (progress: number, status: "queued" | "running" | "succeeded" | "failed" = "running") => ({
  createdAt: new Date(T0).toISOString(),
  progress,
  status,
});

describe("trainingEta", () => {
  it("starts from the typical duration", () => {
    expect(trainingEta(job(0, "queued"), at(0))).toEqual({
      elapsedMinutes: 0,
      remainingMinutes: TYPICAL_TRAINING_MINUTES,
      label: `About ${TYPICAL_TRAINING_MINUTES} minutes left`,
    });
    expect(trainingEta(job(2), at(5)).remainingMinutes).toBe(15);
  });

  it("follows real progress once it is meaningful", () => {
    // Half done after 6 minutes: about 6 more, whatever the typical duration says.
    expect(trainingEta(job(50), at(6))).toMatchObject({ elapsedMinutes: 6, remainingMinutes: 6, label: "About 6 minutes left" });
    // A slow run: 40% after 16 minutes → about 24 minutes more.
    expect(trainingEta(job(40), at(16)).remainingMinutes).toBe(24);
  });

  it("never claims zero minutes while running, and admits a slow run", () => {
    expect(trainingEta(job(97), at(19))).toMatchObject({ remainingMinutes: 0, label: "Almost done…" });
    expect(trainingEta(job(0), at(22))).toMatchObject({ remainingMinutes: 1, label: "Any minute now" });
    expect(trainingEta(job(0), at(40))).toMatchObject({ remainingMinutes: null, label: "Taking longer than usual" });
    expect(trainingEta(job(10), at(1)).label).toBe("About 19 minutes left");
    expect(trainingEta(job(25), at(5)).remainingMinutes).toBe(15);
  });

  it("has no estimate once the job ended", () => {
    expect(trainingEta(job(100, "succeeded"), at(20))).toMatchObject({ remainingMinutes: null, label: "Done" });
    expect(trainingEta(job(30, "failed"), at(20)).remainingMinutes).toBeNull();
  });

  it("copes with a bad timestamp", () => {
    expect(trainingEta({ createdAt: "nope", progress: 0, status: "running" }, at(3)).elapsedMinutes).toBe(0);
  });
});
