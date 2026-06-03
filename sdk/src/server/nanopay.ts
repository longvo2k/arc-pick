import type { Hex } from "viem";

export interface NanopayPayInput {
  amountUsdc: bigint;
  memo?: string;
}

export interface NanopayResult {
  txHash: Hex;
  method: "nanopay" | "usdc-transfer";
}

export interface InjectedNanopayClient {
  pay: (input: NanopayPayInput) => Promise<{ txHash: Hex }>;
}

export interface FallbackTransfer {
  (input: NanopayPayInput): Promise<Hex>;
}

export interface CreateNanopaymentClientInput {
  nanopayClient?: InjectedNanopayClient;
  fallbackTransfer: FallbackTransfer;
}

export interface NanopaymentClient {
  pay: (input: NanopayPayInput) => Promise<NanopayResult>;
}

export function createNanopaymentClient(input: CreateNanopaymentClientInput): NanopaymentClient {
  return {
    async pay(payInput: NanopayPayInput): Promise<NanopayResult> {
      if (input.nanopayClient) {
        try {
          const r = await input.nanopayClient.pay(payInput);
          return { txHash: r.txHash, method: "nanopay" };
        } catch {
          // fall through to USDC path
        }
      }
      const txHash = await input.fallbackTransfer(payInput);
      return { txHash, method: "usdc-transfer" };
    },
  };
}
