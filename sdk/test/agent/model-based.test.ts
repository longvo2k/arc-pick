import { describe, it, expect, vi } from "vitest";
import { modelBased } from "../../src/agent/strategies/model-based.js";
import type { AgentContext } from "../../src/agent/types.js";
import { MatchStatus, Outcome } from "../../src/core/types.js";

function fakeCtx(): AgentContext {
  const m = {
    matchId: ("0x" + "01".repeat(32)) as `0x${string}`,
    homeTeam: "ARG", awayTeam: "MEX",
    kickoff: 1_800_000_000n,
    status: MatchStatus.Open,
    winningOutcome: null,
  };
  const pool = {
    matchId: m.matchId,
    outcomeStake: [50_000_000n, 30_000_000n, 20_000_000n] as [bigint, bigint, bigint],
    totalPool: 100_000_000n,
    impliedProb: [0.5, 0.3, 0.2] as [number, number, number],
  };
  return {
    ownerWallet: "0x000000000000000000000000000000000000beef" as any,
    capUsdc: 100_000_000n,
    matchesOpen: [m],
    pools: new Map([[m.matchId, pool]]),
    history: [],
    rng: () => 0.5,
    now: () => new Date(1_800_000_000_000),
  };
}

describe("modelBased strategy", () => {
  it("pays per inference and produces a pick from model output", async () => {
    const pay = vi.fn().mockResolvedValue({ txHash: "0xnano", method: "nanopay" as const });
    const messages = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ outcome: 0, confidence: 0.65, sizeBps: 1500, rationale: "Argentina at home" }) }],
    });
    const strategy = modelBased({
      nanopay: { pay },
      anthropic: { messages: { create: messages } } as any,
      model: "claude-haiku-4-5-20251001",
      perCallUsdc: 1000n,
    });
    const picks = await strategy.decide(fakeCtx());
    expect(pay).toHaveBeenCalledTimes(1);
    expect(messages).toHaveBeenCalledTimes(1);
    expect(picks.length).toBe(1);
    expect(picks[0]!.outcome).toBe(Outcome.Home);
    expect(picks[0]!.rationale).toContain("Argentina");
  });

  it("skips a match if pay throws (does not bet on unpaid inference)", async () => {
    const pay = vi.fn().mockRejectedValue(new Error("both failed"));
    const messages = vi.fn();
    const strategy = modelBased({
      nanopay: { pay },
      anthropic: { messages: { create: messages } } as any,
      model: "claude-haiku-4-5-20251001",
      perCallUsdc: 1000n,
    });
    const picks = await strategy.decide(fakeCtx());
    expect(messages).not.toHaveBeenCalled();
    expect(picks.length).toBe(0);
  });

  it("rate-limits to one call per match per hour", async () => {
    const pay = vi.fn().mockResolvedValue({ txHash: "0xn", method: "nanopay" as const });
    const messages = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ outcome: 0, confidence: 0.6, sizeBps: 1000, rationale: "x" }) }],
    });
    const strategy = modelBased({
      nanopay: { pay },
      anthropic: { messages: { create: messages } } as any,
      model: "claude-haiku-4-5-20251001",
      perCallUsdc: 1000n,
    });
    await strategy.decide(fakeCtx());
    const second = await strategy.decide(fakeCtx());
    expect(messages).toHaveBeenCalledTimes(1);
    expect(second.length).toBe(0);
  });
});
