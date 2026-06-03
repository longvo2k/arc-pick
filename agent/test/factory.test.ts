import { describe, it, expect, vi } from "vitest";
import { buildRunner } from "../src/factory.js";
import { inMemoryStore } from "@arc-pick/sdk/agent";

describe("buildRunner", () => {
  it("wires a runner with the conservative strategy", () => {
    const placeBet = vi.fn();
    const claimFor = vi.fn();
    const reader = {
      match: vi.fn(), market: vi.fn(), position: vi.fn(),
      listOpen: vi.fn().mockResolvedValue([]),
      isMatchSettled: vi.fn().mockResolvedValue(false),
      hasUserClaimed: vi.fn().mockResolvedValue(false),
    };
    const runner = buildRunner({
      id: "x", ownerWallet: "0x000000000000000000000000000000000000beef" as any,
      strategyName: "conservative", capUsdc: 50_000_000n, expirySeconds: 3600,
      reader: reader as any, placeBet, claimFor, store: inMemoryStore(),
      knownMatchIds: [], tickSeconds: 60,
    });
    expect(runner.status()).toBe("spawning");
  });
});
