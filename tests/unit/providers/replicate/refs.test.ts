import { describe, expect, it } from "vitest";
import {
  decodeModelRef,
  decodeRequestId,
  destinationName,
  encodeModelRef,
  encodeRequestId,
  loraWeightsFor,
} from "@/providers/ai/replicate/refs";

const HASH = "e".repeat(64);
const WEIGHTS = "https://replicate.delivery/w/trained_model.tar";

describe("request id codec", () => {
  it("round-trips predictions, trainings and groups", () => {
    for (const parts of [
      { kind: "prediction", id: "abc" },
      { kind: "training", id: "t1" },
      { kind: "group", ids: ["a", "b", "c"] },
    ] as const) {
      expect(decodeRequestId(encodeRequestId(parts))).toEqual(parts);
    }
    expect(encodeRequestId({ kind: "group", ids: ["solo"] })).toBe("solo");
    expect(() => decodeRequestId("grp:")).toThrow();
  });
});

describe("model ref codec", () => {
  it("round-trips version + weights and accepts either alone", () => {
    const full = encodeModelRef({ model: "acme/openshoot-x", version: HASH, weights: WEIGHTS });
    expect(full).toBe(`acme/openshoot-x:${HASH}|${WEIGHTS}`);
    expect(decodeModelRef(full)).toEqual({ model: "acme/openshoot-x", version: HASH, weights: WEIGHTS });
    expect(decodeModelRef(`acme/openshoot-x:${HASH}`)).toEqual({ model: "acme/openshoot-x", version: HASH });
    expect(decodeModelRef(WEIGHTS)).toEqual({ weights: WEIGHTS });
  });

  it("returns null for refs that are not Replicate LoRAs", () => {
    for (const ref of ["", "   ", "instant", "http://insecure/x.tar", "fal-ai/flux-lora", undefined, null]) {
      expect(decodeModelRef(ref)).toBeNull();
    }
  });

  it("prefers the weights URL for lora_weights", () => {
    expect(loraWeightsFor({ model: "acme/m", version: HASH, weights: WEIGHTS })).toBe(WEIGHTS);
    expect(loraWeightsFor({ model: "acme/m", version: HASH })).toBe(`acme/m/${HASH}`);
    expect(loraWeightsFor({})).toBeNull();
  });
});

describe("destinationName", () => {
  it("prefixes and sanitizes trigger words", () => {
    expect(destinationName("ohwxabcdef")).toBe("openshoot-ohwxabcdef");
    expect(destinationName("  Ohwx--Ab c ")).toBe("openshoot-ohwx-ab-c");
    expect(() => destinationName("!!!")).toThrow();
  });
});
