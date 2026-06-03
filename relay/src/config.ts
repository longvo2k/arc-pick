export interface RelayConfig {
  port: number;
  chainId: number;
  rpcUrl: string;
  paymasterAddress: `0x${string}`;
  relayerPrivateKey: `0x${string}`;
  ratelimit: { perIpPerMinute: number; perWalletPerMinute: number };
}

function required(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
}

export function loadConfig(): RelayConfig {
  return {
    port: parseInt(process.env.PORT ?? "7787", 10),
    chainId: parseInt(required("CHAIN_ID"), 10),
    rpcUrl: required("RPC_URL"),
    paymasterAddress: required("BET_PAYMASTER_ADDRESS") as `0x${string}`,
    relayerPrivateKey: required("RELAYER_PRIVATE_KEY") as `0x${string}`,
    ratelimit: {
      perIpPerMinute: parseInt(process.env.RATE_LIMIT_IP_PER_MINUTE ?? "60", 10),
      perWalletPerMinute: parseInt(process.env.RATE_LIMIT_WALLET_PER_MINUTE ?? "5", 10),
    },
  };
}
