import type { Address, Hex } from "viem";
import { AgentRunner, conservative, aggressive, modelBased, type Store } from "@arc-pick/sdk/agent";
import { createNanopaymentClient } from "@arc-pick/sdk/server";
import type { OnchainReader } from "@arc-pick/sdk/server";
import Anthropic from "@anthropic-ai/sdk";

export type StrategyName = "conservative" | "aggressive" | "model-based";

export interface BuildRunnerInput {
  id: string;
  ownerWallet: Address;
  strategyName: StrategyName;
  capUsdc: bigint;
  expirySeconds: number;
  reader: OnchainReader;
  placeBet: (input: { matchId: Hex; outcome: 0 | 1 | 2; amount: bigint; ownerWallet: Address }) => Promise<Hex>;
  claimFor: (input: { matchId: Hex; user: Address }) => Promise<Hex>;
  store: Store;
  knownMatchIds: Hex[];
  tickSeconds?: number;
  anthropicApiKey?: string;
  modelName?: string;
  perCallUsdc?: bigint;
  fallbackTransfer?: (input: { amountUsdc: bigint; memo?: string }) => Promise<Hex>;
}

export function buildRunner(input: BuildRunnerInput): AgentRunner {
  let strategy;
  if (input.strategyName === "conservative") strategy = conservative();
  else if (input.strategyName === "aggressive") strategy = aggressive();
  else if (input.strategyName === "model-based") {
    if (!input.anthropicApiKey) throw new Error("model-based needs anthropicApiKey");
    if (!input.fallbackTransfer) throw new Error("model-based needs fallbackTransfer");
    strategy = modelBased({
      nanopay: createNanopaymentClient({ fallbackTransfer: input.fallbackTransfer }),
      anthropic: new Anthropic({ apiKey: input.anthropicApiKey }),
      model: input.modelName ?? "claude-haiku-4-5-20251001",
      perCallUsdc: input.perCallUsdc ?? 1000n,
    });
  } else {
    throw new Error(`unknown strategy ${input.strategyName}`);
  }
  return new AgentRunner({
    id: input.id,
    ownerWallet: input.ownerWallet,
    strategy,
    capUsdc: input.capUsdc,
    expirySeconds: input.expirySeconds,
    reader: input.reader,
    placeBet: input.placeBet,
    claimFor: input.claimFor,
    store: input.store,
    knownMatchIds: input.knownMatchIds,
    tickSeconds: input.tickSeconds,
  });
}
