import { Outcome, MatchStatus } from "../../core/types.js";
import type { Strategy } from "../types.js";
import type { Pick as MarketPick } from "../../core/types.js";
import { impliedProbsFromElo } from "../elo.js";
import { kellyFraction, payoutMultiplier } from "../kelly.js";

const MIN_STAKE = 500_000n;
const UNDERDOG_TILT = 1.25;

function bigintFromFloat(bankroll: bigint, fraction: number): bigint {
  const scaled = BigInt(Math.floor(fraction * 1_000_000));
  return (bankroll * scaled) / 1_000_000n;
}

export function aggressive(): Strategy {
  return {
    name: "aggressive",
    async decide(ctx) {
      const picks: MarketPick[] = [];
      for (const m of ctx.matchesOpen) {
        if (m.status !== MatchStatus.Open) continue;
        const pool = ctx.pools.get(m.matchId);
        if (!pool || pool.totalPool === 0n) continue;
        const modelProbs = impliedProbsFromElo(m.homeTeam, m.awayTeam);
        let bestOutcome: Outcome | null = null;
        let bestSize = 0n;
        for (const o of [Outcome.Home, Outcome.Draw, Outcome.Away] as const) {
          const modelP = modelProbs[o];
          const impliedP = pool.impliedProb[o];
          if (modelP <= impliedP) continue;
          const sizingAmount = (ctx.capUsdc * 250n) / 1000n;
          const mult = payoutMultiplier(pool.totalPool, pool.outcomeStake[o], sizingAmount);
          if (mult <= 1) continue;
          let f = kellyFraction(modelP, mult);
          if (impliedP <= 0.25) f *= UNDERDOG_TILT;
          const amount = bigintFromFloat(ctx.capUsdc, Math.min(0.5, f));
          if (amount < MIN_STAKE) continue;
          if (amount > bestSize) {
            bestSize = amount;
            bestOutcome = o;
          }
        }
        if (bestOutcome !== null && bestSize > 0n) {
          picks.push({ matchId: m.matchId, outcome: bestOutcome, amount: bestSize, rationale: "Full Kelly + underdog tilt" });
        }
      }
      return picks;
    },
  };
}
