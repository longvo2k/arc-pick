import type { Address, Hex } from "viem";
import type { Match, MarketState, Outcome, Pick as MarketPick } from "../core/types.js";

export type { Pick as MarketPick } from "../core/types.js";

export type AgentStatus = "spawning" | "active" | "paused" | "expired" | "errored";

export interface AgentContext {
  ownerWallet: Address;
  capUsdc: bigint;
  matchesOpen: Match[];
  pools: Map<Hex, MarketState>;
  history: Bet[];
  rng: () => number;
  now: () => Date;
}

export interface Bet {
  matchId: Hex;
  outcome: Outcome;
  amount: bigint;
  placedAt: Date;
  txHash?: Hex;
}

export interface Strategy {
  readonly name: string;
  decide(ctx: AgentContext): Promise<MarketPick[]>;
}

export interface AgentSpawnInput {
  ownerWallet: Address;
  strategy: Strategy;
  capUsdc: bigint;
  expirySeconds: number;
  modelProviderWallet?: Address;
}
