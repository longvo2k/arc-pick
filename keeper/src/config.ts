export interface KeeperConfig {
  chainId: number;
  rpcUrl: string;
  registry: `0x${string}`;
  oracle: `0x${string}`;
  betVault: `0x${string}`;
  keeperPrivateKey: `0x${string}`;
  knownMatchIds: `0x${string}`[];
  tickSeconds: number;
}

function required(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
}

export function loadConfig(): KeeperConfig {
  const ids = (process.env.KNOWN_MATCH_IDS ?? "").split(",").filter(Boolean) as `0x${string}`[];
  return {
    chainId: parseInt(required("CHAIN_ID"), 10),
    rpcUrl: required("RPC_URL"),
    registry: required("MATCH_REGISTRY_ADDRESS") as `0x${string}`,
    oracle: required("ORACLE_ADDRESS") as `0x${string}`,
    betVault: required("BET_VAULT_ADDRESS") as `0x${string}`,
    keeperPrivateKey: required("KEEPER_PRIVATE_KEY") as `0x${string}`,
    knownMatchIds: ids,
    tickSeconds: parseInt(process.env.TICK_SECONDS ?? "60", 10),
  };
}
