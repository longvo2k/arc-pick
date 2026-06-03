import { createPublicClient, createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MatchRegistryAbi, BetVaultAbi, OracleAbi, arcTestnet, MatchStatus } from "@arc-pick/sdk/core";
import { loadConfig } from "./config.js";
import { decideActions, type KnownMatch } from "./tick.js";
import { log } from "./log.js";

const cfg = loadConfig();
const chain = { ...arcTestnet, id: cfg.chainId, rpcUrls: { default: { http: [cfg.rpcUrl] }, public: { http: [cfg.rpcUrl] } } };
const account = privateKeyToAccount(cfg.keeperPrivateKey);
const wallet = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });
const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });

async function loadState(): Promise<KnownMatch[]> {
  const out: KnownMatch[] = [];
  for (const matchId of cfg.knownMatchIds) {
    const m = await publicClient.readContract({
      address: cfg.registry, abi: MatchRegistryAbi, functionName: "matches", args: [matchId],
    }) as readonly [string, string, bigint, number, number];
    const r = await publicClient.readContract({
      address: cfg.oracle, abi: OracleAbi, functionName: "results", args: [matchId],
    }) as readonly [number, number, bigint];
    out.push({ matchId, status: m[3] as MatchStatus, kickoff: m[2], resultPosted: r[2] > 0n });
  }
  return out;
}

async function tick() {
  const state = await loadState();
  const now = BigInt(Math.floor(Date.now() / 1000));
  const { close, settle } = decideActions({ now, knownMatches: state });
  for (const matchId of close) {
    try {
      const data = encodeFunctionData({ abi: MatchRegistryAbi, functionName: "closeMarket", args: [matchId] });
      const tx = await wallet.sendTransaction({ to: cfg.registry, data });
      log.info({ matchId, tx }, "closed market");
    } catch (err: any) { log.error({ err: err?.message, matchId }, "close failed"); }
  }
  for (const matchId of settle) {
    try {
      const data = encodeFunctionData({ abi: BetVaultAbi, functionName: "settleMarket", args: [matchId] });
      const tx = await wallet.sendTransaction({ to: cfg.betVault, data });
      log.info({ matchId, tx }, "settled market");
    } catch (err: any) { log.error({ err: err?.message, matchId }, "settle failed"); }
  }
}

log.info({ tickSeconds: cfg.tickSeconds, knownMatchIds: cfg.knownMatchIds.length }, "keeper starting");
tick().catch((e) => log.error(e, "first tick failed"));
setInterval(() => tick().catch((e) => log.error(e, "tick failed")), cfg.tickSeconds * 1000);
