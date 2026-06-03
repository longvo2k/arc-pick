import { describe, it, expect, vi } from "vitest";
import { AgentRunner } from "../../src/agent/runner.js";
import { inMemoryStore } from "../../src/agent/store-memory.js";
import { conservative } from "../../src/agent/strategies/conservative.js";
import { MatchStatus } from "../../src/core/types.js";

function fakeReader() {
  const matches = [
    {
      matchId: ("0x" + "01".repeat(32)) as `0x${string}`,
      homeTeam: "ARG", awayTeam: "MEX",
      kickoff: 9_000_000_000n,
      status: MatchStatus.Open,
      winningOutcome: null,
    },
  ];
  const market = {
    matchId: matches[0]!.matchId,
    outcomeStake: [50_000_000n, 30_000_000n, 20_000_000n] as [bigint, bigint, bigint],
    totalPool: 100_000_000n,
    impliedProb: [0.5, 0.3, 0.2] as [number, number, number],
  };
  return {
    match: async () => matches[0]!,
    market: async () => market,
    position: async () => ({ matchId: matches[0]!.matchId, user: "0x0" as any, stakes: [0n, 0n, 0n] as [bigint, bigint, bigint], claimed: false, refunded: false }),
    listOpen: async () => matches,
    isMatchSettled: async () => false,
    hasUserClaimed: async () => false,
  };
}

describe("AgentRunner", () => {
  it("places at least one bet on tick when strategy returns picks", async () => {
    const placeBet = vi.fn().mockResolvedValue("0xtx");
    const claimFor = vi.fn();
    const runner = new AgentRunner({
      id: "agent-1",
      ownerWallet: "0x000000000000000000000000000000000000beef" as any,
      strategy: conservative(),
      capUsdc: 50_000_000n,
      expirySeconds: 86_400,
      reader: fakeReader() as any,
      placeBet,
      claimFor,
      store: inMemoryStore(),
      knownMatchIds: [("0x" + "01".repeat(32)) as `0x${string}`],
      tickSeconds: 60,
    });
    await runner.start();
    await runner.pause();
    expect(placeBet).toHaveBeenCalled();
    expect(runner.status()).toBe("paused");
    expect(runner.remainingCap()).toBeLessThan(50_000_000n);
  });

  it("expires when now >= expiresAt", async () => {
    const placeBet = vi.fn().mockResolvedValue("0xtx");
    const now = vi.fn();
    now.mockReturnValue(new Date(1_000_000_000_000));
    const runner = new AgentRunner({
      id: "agent-2",
      ownerWallet: "0x000000000000000000000000000000000000beef" as any,
      strategy: conservative(),
      capUsdc: 50_000_000n,
      expirySeconds: 1,
      reader: fakeReader() as any,
      placeBet,
      claimFor: vi.fn(),
      store: inMemoryStore(),
      knownMatchIds: [("0x" + "01".repeat(32)) as `0x${string}`],
      tickSeconds: 60,
      now,
    });
    await runner.start();
    now.mockReturnValue(new Date(1_000_000_000_000 + 2000));
    await runner.tick();
    expect(runner.status()).toBe("expired");
  });
});
