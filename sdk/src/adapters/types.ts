import type { Address, Hex } from "viem";
import type { TypedDataPayload } from "../core/permit2.js";

export interface WalletAdapter {
  connect(opts?: { email?: string }): Promise<{ address: Address }>;
  disconnect(): Promise<void>;
  getAddress(): Address | null;
  signTypedData(payload: TypedDataPayload): Promise<Hex>;
  signMessage(message: string): Promise<Hex>;
}
