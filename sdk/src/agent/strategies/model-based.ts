import type Anthropic from "@anthropic-ai/sdk";
import type { Strategy } from "../types.js";
import type { Pick as MarketPick } from "../../core/types.js";
import { Outcome, MatchStatus } from "../../core/types.js";

const RATE_LIMIT_MS = 60 * 60 * 1000;

export interface ModelBasedInput {
  nanopay: { pay: (input: { amountUsdc: bigint; memo?: string }) => Promise<{ txHash: `0x${string}`; method: "nanopay" | "usdc-transfer" }> };
  anthropic: Anthropic;
  model: string;
  perCallUsdc: bigint;
  systemPrompt?: string;
}

interface ModelOutput {
  outcome: 0 | 1 | 2;
  confidence: number;
  sizeBps: number;
  rationale: string;
}

const DEFAULT_SYSTEM = `You are a football match outcome rater. Given a match between two teams, current pool weights, and recent context, you respond with strict JSON of shape:
{"outcome": 0|1|2, "confidence": 0..1, "sizeBps": 1..10000, "rationale": string}
Outcomes: 0=Home, 1=Draw, 2=Away. Be calibrated. Do not chase narratives. No text outside the JSON.`;

function sizeFromBps(bankroll: bigint, confidence: number, sizeBps: number): bigint {
  const conf = Math.max(0, Math.min(1, confidence));
  const bps = Math.max(0, Math.min(10000, Math.floor(sizeBps)));
  const scaled = BigInt(Math.floor(conf * bps));
  return (bankroll * scaled) / 10_000n;
}

export function modelBased(input: ModelBasedInput): Strategy {
  const lastCalled = new Map<string, number>();
  return {
    name: "model-based",
    async decide(ctx) {
      const picks: MarketPick[] = [];
      for (const m of ctx.matchesOpen) {
        if (m.status !== MatchStatus.Open) continue;
        const last = lastCalled.get(m.matchId) ?? 0;
        const now = ctx.now().getTime();
        if (now - last < RATE_LIMIT_MS) continue;
        const pool = ctx.pools.get(m.matchId);
        if (!pool || pool.totalPool === 0n) continue;
        try {
          await input.nanopay.pay({ amountUsdc: input.perCallUsdc, memo: `${ctx.ownerWallet}:${m.matchId}` });
        } catch {
          continue;
        }
        let parsed: ModelOutput | null = null;
        try {
          const r = await input.anthropic.messages.create({
            model: input.model,
            max_tokens: 200,
            system: input.systemPrompt ?? DEFAULT_SYSTEM,
            messages: [
              {
                role: "user",
                content: `${m.homeTeam} vs ${m.awayTeam}. Pool weights: H=${pool.impliedProb[0]!.toFixed(2)} D=${pool.impliedProb[1]!.toFixed(2)} A=${pool.impliedProb[2]!.toFixed(2)}. Respond JSON.`,
              },
            ],
          });
          const block = r.content[0];
          const text = (block && "text" in block) ? (block as { text: string }).text : "";
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
        lastCalled.set(m.matchId, now);
        if (!parsed) continue;
        const stake = sizeFromBps(ctx.capUsdc, parsed.confidence, parsed.sizeBps);
        if (stake <= 0n) continue;
        picks.push({
          matchId: m.matchId,
          outcome: parsed.outcome as Outcome,
          amount: stake,
          rationale: parsed.rationale,
        });
      }
      return picks;
    },
  };
}
