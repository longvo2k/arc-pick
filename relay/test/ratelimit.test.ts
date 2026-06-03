import { describe, it, expect, beforeEach } from "vitest";
import { createSlidingWindow } from "../src/ratelimit.js";

describe("createSlidingWindow", () => {
  let window: ReturnType<typeof createSlidingWindow>;
  let now = 0;
  beforeEach(() => { now = 0; window = createSlidingWindow({ limit: 3, windowMs: 1000, now: () => now }); });

  it("allows up to limit within window", () => {
    expect(window.allow("a")).toBe(true);
    expect(window.allow("a")).toBe(true);
    expect(window.allow("a")).toBe(true);
    expect(window.allow("a")).toBe(false);
  });

  it("releases capacity after window passes", () => {
    window.allow("a"); window.allow("a"); window.allow("a");
    now += 1001;
    expect(window.allow("a")).toBe(true);
  });

  it("keys are independent", () => {
    window.allow("a"); window.allow("a"); window.allow("a");
    expect(window.allow("b")).toBe(true);
  });
});
