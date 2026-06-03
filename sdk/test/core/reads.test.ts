import { describe, it, expect, vi } from "vitest";
import { readMatch, readMarket, readUserPosition, listOpenMatches } from "../../src/core/reads.js";
import { MatchStatus } from "../../src/core/types.js";

function makeMockClient(returns: Record<string, unknown>) {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (!(functionName in returns)) throw new Error(`unexpected ${functionName}`);
      return returns[functionName];
    }),
  } as any;
}

describe("readMatch", () => {
  it("decodes Match from registry.matches() tuple", async () => {
    const client = makeMockClient({
      matches: [
        "0x4152470000000000000000000000000000000000000000000000000000000000",
        "0x4d45580000000000000000000000000000000000000000000000000000000000",
        1_800_000_000n,
        1,
        0,
      ],
    });
    const m = await readMatch({
      client,
      matchRegistry: "0x000000000000000000000000000000000000bbbb",
      matchId: ("0x" + "01".repeat(32)) as `0x${string}`,
    });
    expect(m.homeTeam).toBe("ARG");
    expect(m.awayTeam).toBe("MEX");
    expect(m.kickoff).toBe(1_800_000_000n);
    expect(m.status).toBe(MatchStatus.Open);
    expect(m.winningOutcome).toBeNull();
  });
});

describe("readMarket", () => {
  it("returns zero implied prob for empty pool", async () => {
    const empty = makeMockClient({ outcomeStake: 0n });
    const m = await readMarket({
      client: empty,
      market: "0x000000000000000000000000000000000000aaaa",
      matchId: ("0x" + "01".repeat(32)) as `0x${string}`,
    });
    expect(m.totalPool).toBe(0n);
    expect(m.impliedProb).toEqual([0, 0, 0]);
  });
});

describe("readUserPosition", () => {
  it("is a function", () => {
    expect(typeof readUserPosition).toBe("function");
  });
});

describe("listOpenMatches", () => {
  it("is a function", () => {
    expect(typeof listOpenMatches).toBe("function");
  });
});
