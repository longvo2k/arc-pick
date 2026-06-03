import { describe, it, expect } from "vitest";
import { kellyFraction, kellyQuarter, edgePoints, payoutMultiplier } from "../../src/agent/kelly.js";

describe("kellyFraction", () => {
  it("returns 0 when payout multiplier <= 1", () => {
    expect(kellyFraction(0.6, 1)).toBe(0);
  });
  it("returns positive for favorable bets", () => {
    expect(kellyFraction(0.6, 2)).toBeCloseTo(0.2, 6);
  });
  it("returns 0 for unfavorable bets", () => {
    expect(kellyFraction(0.3, 2)).toBe(0);
  });
});

describe("kellyQuarter", () => {
  it("returns quarter of full Kelly", () => {
    expect(kellyQuarter(0.6, 2)).toBeCloseTo(0.05, 6);
  });
  it("caps at 0.5 of bankroll", () => {
    expect(kellyQuarter(0.99, 100)).toBeLessThanOrEqual(0.5);
  });
});

describe("edgePoints", () => {
  it("computes positive edge for favorable model", () => {
    expect(edgePoints(0.5, 0.4)).toBeCloseTo(10, 6);
  });
});

describe("payoutMultiplier", () => {
  it("approximates parimutuel payout after self-inclusion", () => {
    const m = payoutMultiplier(100n * 10n**6n, 40n * 10n**6n, 10n * 10n**6n);
    expect(m).toBeCloseTo(2.2, 6);
  });
});
