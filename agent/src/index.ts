import { createPublicClient, createWalletClient, http, encodeFunctionData, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, BetVaultAbi } from "@arc-pick/sdk/core";
import { createOnchainReader } from "@arc-pick/sdk/server";
import { inMemoryStore } from "@arc-pick/sdk/agent";
import { loadConfig } from "./config.js";
import { buildRunner } from "./factory.js";
import { buildAgentServer, type SpawnInput, type AgentSummary } from "./server.js";
import { spawnSeedBots } from "./seedBots.js";
import { log } from "./log.js";

const cfg = loadConfig();
const chain = { ...arcTestnet, id: cfg.chainId, rpcUrls: { default: { http: [cfg.rpcUrl] }, public: { http: [cfg.rpcUrl] } } };
const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
const platformAccount = privateKeyToAccount(cfg.platformPrivateKey);
const platformWallet = createWalletClient({ account: platformAccount, chain, transport: http(cfg.rpcUrl) });

const reader = createOnchainReader({
  client: publicClient,
  addrs: {
    usdc: cfg.usdc, permit2: cfg.permit2,
    matchRegistry: cfg.matchRegistry, market: cfg.market, betVault: cfg.betVault,
    oracle: cfg.oracle, betPaymaster: cfg.betPaymaster,
  },
});

const store = inMemoryStore();
const runners = new Map<string, ReturnType<typeof buildRunner>>();
let counter = 0;

function nextId(label?: string): string {
  counter += 1;
  return label ? `${label}-${counter}` : `agent-${counter}`;
}

async function placeBet(input: { matchId: Hex; outcome: 0 | 1 | 2; amount: bigint; ownerWallet: Address }): Promise<Hex> {
  const data = encodeFunctionData({
    abi: BetVaultAbi,
    functionName: "placeBetFromAllowance",
    args: [input.matchId, input.outcome, input.amount, input.ownerWallet],
  });
  return platformWallet.sendTransaction({ to: cfg.betVault, data });
}

async function claimFor(input: { matchId: Hex; user: Address }): Promise<Hex> {
  const data = encodeFunctionData({ abi: BetVaultAbi, functionName: "claimFor", args: [input.matchId, input.user] });
  return platformWallet.sendTransaction({ to: cfg.betVault, data });
}

async function fallbackTransfer({ amountUsdc }: { amountUsdc: bigint }): Promise<Hex> {
  const usdcAbi = [
    {
      type: "function", name: "transferFrom",
      inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" }],
      outputs: [{ type: "bool" }], stateMutability: "nonpayable",
    },
  ] as const;
  const data = encodeFunctionData({
    abi: usdcAbi, functionName: "transferFrom",
    args: [platformAccount.address, cfg.modelProviderWallet, amountUsdc],
  });
  return platformWallet.sendTransaction({ to: cfg.usdc, data });
}

async function spawn(input: SpawnInput & { label?: string }): Promise<{ id: string }> {
  const id = nextId(input.label);
  const runner = buildRunner({
    id,
    ownerWallet: input.ownerWallet,
    strategyName: input.strategy,
    capUsdc: BigInt(input.capUsdc),
    expirySeconds: input.expirySeconds,
    reader,
    placeBet,
    claimFor,
    store,
    knownMatchIds: cfg.knownMatchIds,
    tickSeconds: cfg.tickSeconds,
    anthropicApiKey: cfg.anthropicApiKey,
    modelName: cfg.modelName,
    perCallUsdc: cfg.perCallUsdc,
    fallbackTransfer,
  });
  await runner.start();
  runners.set(id, runner);
  return { id };
}

async function pause(id: string): Promise<void> {
  const r = runners.get(id);
  if (!r) throw new Error("not found");
  await r.pause();
}

async function list(): Promise<AgentSummary[]> {
  const records = await store.list();
  return records.map((r) => ({
    id: r.id,
    status: r.status,
    capUsdc: r.capUsdc.toString(),
    spentUsdc: r.spentUsdc.toString(),
    strategy: r.strategyName,
  }));
}

const app = buildAgentServer({ spawn, list, pause });
app.listen({ port: cfg.port, host: "0.0.0.0" }).then(async () => {
  log.info({ port: cfg.port }, "agent service listening");
  if (cfg.seedBots.length > 0) {
    await spawnSeedBots(
      cfg.seedBots.map((b) => ({ ...b, capUsdc: BigInt(b.capUsdc) })),
      { spawn: (input) => spawn(input as any) },
    );
  }
}).catch((err) => {
  log.error({ err: err.message }, "failed to start"); process.exit(1);
});
