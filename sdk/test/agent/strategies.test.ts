import { describe, it, expect } from "vitest";
import { conservative, aggressive } from "../../src/agent/strategies/index.js";
import { MatchStatus } from "../../src/core/types.js";
import type { AgentContext } from "../../src/agent/types.js";

function fakeMatch(id: number, home: string, away: string) {
  return {
    matchId: ("0x" + id.toString(16).padStart(2, "0").repeat(32)) as `0x${string}`,
    homeTeam: home,
    awayTeam: away,
    kickoff: 1_800_000_000n,
    status: MatchStatus.Open,
    winningOutcome: null,
  };
}

function ctx(args: Partial<AgentContext> = {}): AgentContext {
  const m1 = fakeMatch(1, "ARG", "MEX");
  const m2 = fakeMatch(2, "BRA", "CRC");
  const pools = new Map();
  pools.set(m1.matchId, {
    matchId: m1.matchId,
    outcomeStake: [50_000_000n, 30_000_000n, 20_000_000n],
    totalPool: 100_000_000n,
    impliedProb: [0.5, 0.3, 0.2],
  });
  pools.set(m2.matchId, {
    matchId: m2.matchId,
    outcomeStake: [80_000_000n, 10_000_000n, 10_000_000n],
    totalPool: 100_000_000n,
    impliedProb: [0.8, 0.1, 0.1],
  });
  return {
    ownerWallet: "0x000000000000000000000000000000000000beef" as any,
    capUsdc: 50_000_000n,
    matchesOpen: [m1, m2],
    pools,
    history: [],
    rng: () => 0.5,
    now: () => new Date(1_800_000_000_000),
    ...args,
  };
}

describe("conservative strategy", () => {
  it("picks outcomes with edge >=5pp", async () => {
    const picks = await conservative().decide(ctx());
    expect(picks.length).toBeGreaterThan(0);
    expect(picks[0]!.amount).toBeGreaterThanOrEqual(500_000n);
  });

  it("skips matches with no pool", async () => {
    const c = ctx();
    c.pools.clear();
    const picks = await conservative().decide(c);
    expect(picks.length).toBe(0);
  });

  it("returns deterministic picks for the same context", async () => {
    const a = await conservative().decide(ctx());
    const b = await conservative().decide(ctx());
    expect(a).toEqual(b);
  });
});

describe("aggressive strategy", () => {
  it("places at least one pick when edges exist", async () => {
    const picks = await aggressive().decide(ctx());
    expect(picks.length).toBeGreaterThan(0);
  });
});
