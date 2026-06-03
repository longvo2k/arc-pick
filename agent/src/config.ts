export interface AgentSvcConfig {
  port: number;
  chainId: number;
  rpcUrl: string;
  usdc: `0x${string}`;
  permit2: `0x${string}`;
  matchRegistry: `0x${string}`;
  market: `0x${string}`;
  betVault: `0x${string}`;
  oracle: `0x${string}`;
  betPaymaster: `0x${string}`;
  platformPrivateKey: `0x${string}`;
  modelProviderWallet: `0x${string}`;
  anthropicApiKey?: string;
  modelName: string;
  perCallUsdc: bigint;
  tickSeconds: number;
  knownMatchIds: `0x${string}`[];
  seedBots: { name: string; strategy: "conservative" | "aggressive" | "model-based"; capUsdc: bigint; ownerWallet: `0x${string}`; ownerPrivateKey: `0x${string}` }[];
}

function required(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
}

export function loadConfig(): AgentSvcConfig {
  const ids = (process.env.KNOWN_MATCH_IDS ?? "").split(",").filter(Boolean) as `0x${string}`[];
  const seedBotsRaw = process.env.SEED_BOTS;
  const seedBots = seedBotsRaw ? JSON.parse(seedBotsRaw) : [];
  return {
    port: parseInt(process.env.PORT ?? "7788", 10),
    chainId: parseInt(required("CHAIN_ID"), 10),
    rpcUrl: required("RPC_URL"),
    usdc: required("USDC_ADDRESS") as `0x${string}`,
    permit2: required("PERMIT2_ADDRESS") as `0x${string}`,
    matchRegistry: required("MATCH_REGISTRY_ADDRESS") as `0x${string}`,
    market: required("MARKET_ADDRESS") as `0x${string}`,
    betVault: required("BET_VAULT_ADDRESS") as `0x${string}`,
    oracle: required("ORACLE_ADDRESS") as `0x${string}`,
    betPaymaster: required("BET_PAYMASTER_ADDRESS") as `0x${string}`,
    platformPrivateKey: required("PLATFORM_PRIVATE_KEY") as `0x${string}`,
    modelProviderWallet: required("MODEL_PROVIDER_WALLET") as `0x${string}`,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    modelName: process.env.MODEL_NAME ?? "claude-haiku-4-5-20251001",
    perCallUsdc: BigInt(process.env.PER_CALL_USDC ?? "1000"),
    tickSeconds: parseInt(process.env.TICK_SECONDS ?? "60", 10),
    knownMatchIds: ids,
    seedBots,
  };
}
