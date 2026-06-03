import type { Address, Chain } from "viem";

export const arcTestnet: Chain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
    public: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.network" },
  },
  testnet: true,
};

export interface ArcPickAddresses {
  usdc: Address;
  permit2: Address;
  matchRegistry: Address;
  market: Address;
  betVault: Address;
  oracle: Address;
  betPaymaster: Address;
}

// Canonical Permit2 on Arc Testnet
export const PERMIT2_CANONICAL: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Helper: load deployed.env contents (compose dev) into an ArcPickAddresses object
export function addressesFromEnv(env: Record<string, string | undefined>): ArcPickAddresses {
  const get = (k: string): Address => {
    const v = env[k];
    if (!v) throw new Error(`Missing env var ${k}`);
    return v as Address;
  };
  return {
    usdc: get("USDC_ADDRESS"),
    permit2: get("PERMIT2_ADDRESS"),
    matchRegistry: get("MATCH_REGISTRY_ADDRESS"),
    market: get("MARKET_ADDRESS"),
    betVault: get("BET_VAULT_ADDRESS"),
    oracle: get("ORACLE_ADDRESS"),
    betPaymaster: get("BET_PAYMASTER_ADDRESS"),
  };
}
