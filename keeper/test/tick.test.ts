import { describe, it, expect } from "vitest";
import { decideActions } from "../src/tick.js";
import { MatchStatus } from "@arc-pick/sdk/core";

describe("decideActions", () => {
  it("returns closeMarket for Open matches past kickoff", () => {
    const actions = decideActions({
      now: 1_800_000_000n,
      knownMatches: [
        { matchId: ("0x" + "01".repeat(32)) as `0x${string}`, status: MatchStatus.Open, kickoff: 1_800_000_000n - 10n, resultPosted: false },
        { matchId: ("0x" + "02".repeat(32)) as `0x${string}`, status: MatchStatus.Open, kickoff: 1_800_000_000n + 600n, resultPosted: false },
      ],
    });
    expect(actions.close.length).toBe(1);
    expect(actions.close[0]).toBe("0x" + "01".repeat(32));
    expect(actions.settle.length).toBe(0);
  });

  it("returns settleMarket for Closed matches with result posted", () => {
    const actions = decideActions({
      now: 1_800_000_000n,
      knownMatches: [
        { matchId: ("0x" + "01".repeat(32)) as `0x${string}`, status: MatchStatus.Closed, kickoff: 1_800_000_000n - 100n, resultPosted: true },
        { matchId: ("0x" + "02".repeat(32)) as `0x${string}`, status: MatchStatus.Closed, kickoff: 1_800_000_000n - 100n, resultPosted: false },
      ],
    });
    expect(actions.settle.length).toBe(1);
    expect(actions.settle[0]).toBe("0x" + "01".repeat(32));
    expect(actions.close.length).toBe(0);
  });

  it("returns nothing for Settled matches", () => {
    const actions = decideActions({
      now: 1_800_000_000n,
      knownMatches: [
        { matchId: ("0x" + "01".repeat(32)) as `0x${string}`, status: MatchStatus.Settled, kickoff: 1_800_000_000n - 100n, resultPosted: true },
      ],
    });
    expect(actions.close.length).toBe(0);
    expect(actions.settle.length).toBe(0);
  });
});
