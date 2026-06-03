export interface OracleConfig {
  chainId: number;
  rpcUrl: string;
  registry: `0x${string}`;
  oracle: `0x${string}`;
  signerPrivateKey: `0x${string}`;
  submitterPrivateKey: `0x${string}`;
  footballDataBase: string;
  footballDataApiKey?: string;
  pollSeconds: number;
}

function required(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
}

export function loadConfig(): OracleConfig {
  return {
    chainId: parseInt(required("CHAIN_ID"), 10),
    rpcUrl: required("RPC_URL"),
    registry: required("MATCH_REGISTRY_ADDRESS") as `0x${string}`,
    oracle: required("ORACLE_ADDRESS") as `0x${string}`,
    signerPrivateKey: required("ORACLE_SIGNER_PRIVATE_KEY") as `0x${string}`,
    submitterPrivateKey: required("ORACLE_SUBMITTER_PRIVATE_KEY") as `0x${string}`,
    footballDataBase: process.env.FOOTBALL_DATA_API_BASE ?? "https://api.football-data.org/v4",
    footballDataApiKey: process.env.FOOTBALL_DATA_API_KEY,
    pollSeconds: parseInt(process.env.POLL_INTERVAL_SECONDS ?? "600", 10),
  };
}
