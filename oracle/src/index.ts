import { createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MatchRegistryAbi, OracleAbi, arcTestnet, asciiToBytes32 } from "@arc-pick/sdk/core";
import { loadConfig } from "./config.js";
import { createHttpFootballDataClient } from "./footballData.js";
import { runOnce } from "./poller.js";
import { signResult } from "./signer.js";
import { log } from "./log.js";

const cfg = loadConfig();
const chain = { ...arcTestnet, id: cfg.chainId, rpcUrls: { default: { http: [cfg.rpcUrl] }, public: { http: [cfg.rpcUrl] } } };
const signerAccount = privateKeyToAccount(cfg.signerPrivateKey);
const submitterAccount = privateKeyToAccount(cfg.submitterPrivateKey);
const wallet = createWalletClient({ account: submitterAccount, chain, transport: http(cfg.rpcUrl) });
const fd = createHttpFootballDataClient({ base: cfg.footballDataBase, apiKey: cfg.footballDataApiKey, competition: "WC" });

const knownResults = new Set<string>();

async function tick() {
  await runOnce({
    fd,
    now: () => new Date(),
    knownResults,
    async onUpsertMatch(m) {
      const data = encodeFunctionData({
        abi: MatchRegistryAbi,
        functionName: "upsertMatch",
        args: [m.matchId, asciiToBytes32(m.homeTeam.slice(0, 3).toUpperCase()), asciiToBytes32(m.awayTeam.slice(0, 3).toUpperCase()), m.kickoff],
      });
      try {
        const tx = await wallet.sendTransaction({ to: cfg.registry, data });
        log.info({ matchId: m.matchId, tx }, "upserted match");
      } catch (err: any) {
        log.error({ err: err?.message, matchId: m.matchId }, "upsert failed (may be already-Closed)");
      }
    },
    async onSubmitResult(r) {
      const sig = await signResult({
        account: signerAccount,
        matchId: r.matchId,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        signedAt: r.signedAt,
        chainId: cfg.chainId,
        oracleAddress: cfg.oracle,
      });
      const data = encodeFunctionData({
        abi: OracleAbi,
        functionName: "submitResult",
        args: [r.matchId, r.homeScore, r.awayScore, r.signedAt, sig],
      });
      try {
        const tx = await wallet.sendTransaction({ to: cfg.oracle, data });
        knownResults.add(r.matchId);
        log.info({ matchId: r.matchId, tx, homeScore: r.homeScore, awayScore: r.awayScore }, "result submitted");
      } catch (err: any) {
        log.error({ err: err?.message, matchId: r.matchId }, "submit failed");
      }
    },
  });
}

log.info({ pollSeconds: cfg.pollSeconds }, "oracle starting");
tick().catch((e) => log.error(e, "first tick failed"));
setInterval(() => tick().catch((e) => log.error(e, "tick failed")), cfg.pollSeconds * 1000);
