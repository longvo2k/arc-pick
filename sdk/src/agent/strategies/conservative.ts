import { Outcome, MatchStatus } from "../../core/types.js";
import type { Strategy } from "../types.js";
import type { Pick as MarketPick } from "../../core/types.js";
import { impliedProbsFromElo } from "../elo.js";
import { edgePoints, kellyQuarter, payoutMultiplier } from "../kelly.js";

export const MIN_STAKE = 500_000n;
export const MIN_EDGE_POINTS = 5;

function bigintFromFloat(bankroll: bigint, fraction: number): bigint {
  const scaled = BigInt(Math.floor(fraction * 1_000_000));
  return (bankroll * scaled) / 1_000_000n;
}

export function conservative(): Strategy {
  return {
    name: "conservative",
    async decide(ctx) {
      const picks: MarketPick[] = [];
      for (const m of ctx.matchesOpen) {
        if (m.status !== MatchStatus.Open) continue;
        const pool = ctx.pools.get(m.matchId);
        if (!pool || pool.totalPool === 0n) continue;
        const modelProbs = impliedProbsFromElo(m.homeTeam, m.awayTeam);
        let bestOutcome: Outcome | null = null;
        let bestFraction = 0;
        let bestAmount = 0n;
        for (const o of [Outcome.Home, Outcome.Draw, Outcome.Away] as const) {
          const modelP = modelProbs[o];
          const impliedP = pool.impliedProb[o];
          if (edgePoints(modelP, impliedP) < MIN_EDGE_POINTS) continue;
          const sizingAmount = (ctx.capUsdc * 250n) / 1000n;
          const mult = payoutMultiplier(pool.totalPool, pool.outcomeStake[o], sizingAmount);
          if (mult <= 1) continue;
          const f = kellyQuarter(modelP, mult);
          const amount = bigintFromFloat(ctx.capUsdc, f);
          if (amount < MIN_STAKE) continue;
          if (f > bestFraction) {
            bestFraction = f;
            bestOutcome = o;
            bestAmount = amount;
          }
        }
        if (bestOutcome !== null && bestAmount > 0n) {
          picks.push({ matchId: m.matchId, outcome: bestOutcome, amount: bestAmount, rationale: `Elo edge >=${MIN_EDGE_POINTS}pp, Kelly1/4` });
        }
      }
      return picks;
    },
  };
}
