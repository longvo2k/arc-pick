import { describe, it, expect, vi } from "vitest";
import { createOnchainReader } from "../../src/server/onchain.js";

describe("createOnchainReader", () => {
  it("exposes match / market / position / list helpers wired to addrs", async () => {
    const client = {
      readContract: vi.fn(async () => 0n),
    } as any;
    const reader = createOnchainReader({
      client,
      addrs: {
        usdc: "0x0000000000000000000000000000000000000001",
        permit2: "0x0000000000000000000000000000000000000002",
        matchRegistry: "0x0000000000000000000000000000000000000003",
        market: "0x0000000000000000000000000000000000000004",
        betVault: "0x0000000000000000000000000000000000000005",
        oracle: "0x0000000000000000000000000000000000000006",
        betPaymaster: "0x0000000000000000000000000000000000000007",
      },
    });
    expect(typeof reader.match).toBe("function");
    expect(typeof reader.market).toBe("function");
    expect(typeof reader.position).toBe("function");
    expect(typeof reader.listOpen).toBe("function");
    expect(typeof reader.isMatchSettled).toBe("function");
    expect(typeof reader.hasUserClaimed).toBe("function");
  });

  it("isMatchSettled returns true when status === Settled", async () => {
    const client = {
      readContract: vi.fn(async () => {
        return [
          "0x4152470000000000000000000000000000000000000000000000000000000000",
          "0x4d45580000000000000000000000000000000000000000000000000000000000",
          1n,
          3,
          0,
        ];
      }),
    } as any;
    const reader = createOnchainReader({
      client,
      addrs: { usdc: "0x0" as any, permit2: "0x0" as any, matchRegistry: "0x0" as any, market: "0x0" as any, betVault: "0x0" as any, oracle: "0x0" as any, betPaymaster: "0x0" as any },
    });
    const settled = await reader.isMatchSettled(("0x" + "01".repeat(32)) as `0x${string}`);
    expect(settled).toBe(true);
  });
});
