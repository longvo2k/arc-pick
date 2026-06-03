import type { Address, Hex, WalletClient } from "viem";
import type { WalletAdapter } from "./types.js";
import type { TypedDataPayload } from "../core/permit2.js";

export function viemWalletAdapter(client: WalletClient): WalletAdapter {
  let address: Address | null = client.account?.address ?? null;
  return {
    async connect() {
      if (!client.account) throw new Error("viem WalletClient has no account");
      address = client.account.address;
      return { address };
    },
    async disconnect() { address = null; },
    getAddress() { return address; },
    signTypedData(payload: TypedDataPayload): Promise<Hex> {
      if (!client.account) throw new Error("no account");
      return client.signTypedData({
        account: client.account,
        domain: payload.domain as any,
        types: payload.types as any,
        primaryType: payload.primaryType as any,
        message: payload.message as any,
      });
    },
    signMessage(message: string): Promise<Hex> {
      if (!client.account) throw new Error("no account");
      return client.signMessage({ account: client.account, message });
    },
  };
}
