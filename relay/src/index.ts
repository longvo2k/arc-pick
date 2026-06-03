import { createPublicClient, createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BetPaymasterAbi, arcTestnet, type SponsorBetPayload } from "@arc-pick/sdk/core";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";
import { log } from "./log.js";

const cfg = loadConfig();
const chain = { ...arcTestnet, id: cfg.chainId, rpcUrls: { default: { http: [cfg.rpcUrl] }, public: { http: [cfg.rpcUrl] } } };
const account = privateKeyToAccount(cfg.relayerPrivateKey);
const wallet = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });
const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });

async function submit(payload: SponsorBetPayload): Promise<`0x${string}`> {
  const data = encodeFunctionData({
    abi: BetPaymasterAbi,
    functionName: "sponsorBet",
    args: [
      payload.bettor,
      payload.matchId,
      payload.outcome,
      BigInt(payload.amount),
      { permitted: { token: payload.permit.permitted.token, amount: BigInt(payload.permit.permitted.amount) }, nonce: BigInt(payload.permit.nonce), deadline: BigInt(payload.permit.deadline) },
      payload.permitSig,
      payload.userSig,
      BigInt(payload.deadline),
    ],
  });
  const txHash = await wallet.sendTransaction({ to: cfg.paymasterAddress, data, account, chain });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

const app = buildServer({ config: cfg, submit });
app.listen({ port: cfg.port, host: "0.0.0.0" }).then(() => {
  log.info({ port: cfg.port }, "relay listening");
}).catch((err) => {
  log.error({ err: err.message }, "failed to start"); process.exit(1);
});
