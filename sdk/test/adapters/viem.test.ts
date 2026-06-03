import { describe, it, expect } from "vitest";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "../../src/core/addresses.js";
import { viemWalletAdapter } from "../../src/adapters/viem.js";

const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

describe("viemWalletAdapter", () => {
  it("connects and returns the account address", async () => {
    const wc = createWalletClient({ account, chain: arcTestnet, transport: http("http://localhost:8545") });
    const adapter = viemWalletAdapter(wc);
    const { address } = await adapter.connect();
    expect(address).toBe(account.address);
  });

  it("signs typed data through the underlying client", async () => {
    const wc = createWalletClient({ account, chain: arcTestnet, transport: http("http://localhost:8545") });
    const adapter = viemWalletAdapter(wc);
    const sig = await adapter.signTypedData({
      domain: { name: "test", chainId: 5042002, verifyingContract: "0x0000000000000000000000000000000000000001" },
      types: { Test: [{ name: "x", type: "uint256" }] },
      primaryType: "Test",
      message: { x: 7n } as any,
    } as any);
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
  });

  it("signs messages", async () => {
    const wc = createWalletClient({ account, chain: arcTestnet, transport: http("http://localhost:8545") });
    const adapter = viemWalletAdapter(wc);
    const sig = await adapter.signMessage("hello");
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
  });
});
