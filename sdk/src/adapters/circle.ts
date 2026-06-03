import type { WalletAdapter } from "./types.js";

/// Stub for the Circle Modular Wallets adapter. The real implementation lands in P4
/// with the demo so it can be wired against Circle's React SDK. The interface here
/// matches `WalletAdapter` so consumers can plug a different implementation today.
export function circleWalletAdapter(_config?: unknown): WalletAdapter {
  return {
    async connect() { throw new Error("circleWalletAdapter is not wired in P2; use viemWalletAdapter or wait for P4."); },
    async disconnect() { /* noop */ },
    getAddress() { return null; },
    async signTypedData() { throw new Error("circleWalletAdapter is not wired in P2."); },
    async signMessage() { throw new Error("circleWalletAdapter is not wired in P2."); },
  };
}
