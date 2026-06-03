import { describe, it, expect } from "vitest";
import { rating, impliedProbsFromElo } from "../../src/agent/elo.js";

describe("rating", () => {
  it("returns table value when present", () => {
    expect(rating("ARG")).toBe(2150);
    expect(rating("MEX")).toBe(1880);
  });
  it("returns default 1700 for unknown", () => {
    expect(rating("XYZ")).toBe(1700);
  });
});

describe("impliedProbsFromElo", () => {
  it("returns probabilities that sum to ~1", () => {
    const [h, d, a] = impliedProbsFromElo("ARG", "MEX");
    expect(h + d + a).toBeCloseTo(1, 6);
    expect(h).toBeGreaterThan(a);
  });
  it("favors home team with bonus when ratings equal", () => {
    const [h, , a] = impliedProbsFromElo("ARG", "ARG");
    expect(h).toBeGreaterThan(a);
  });
});
