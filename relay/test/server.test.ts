import { describe, it, expect, vi } from "vitest";
import { buildServer } from "../src/server.js";

const baseCfg = {
  port: 0,
  chainId: 5042002,
  rpcUrl: "http://anvil:8545",
  paymasterAddress: "0x000000000000000000000000000000000000beef" as `0x${string}`,
  relayerPrivateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`,
  ratelimit: { perIpPerMinute: 60, perWalletPerMinute: 5 },
};

describe("relay /api/relay/bet", () => {
  it("returns txHash on successful sponsor", async () => {
    const submit = vi.fn().mockResolvedValue("0xtx");
    const app = buildServer({ config: baseCfg, submit });
    const res = await app.inject({
      method: "POST",
      url: "/api/relay/bet",
      payload: { bettor: "0x000000000000000000000000000000000000beef", matchId: "0x" + "01".repeat(32), outcome: 0, amount: "10000000", permit: { permitted: { token: "0x0000000000000000000000000000000000000000", amount: "10000000" }, nonce: "1", deadline: "1800000000" }, permitSig: "0x" + "11".repeat(65), userSig: "0x" + "22".repeat(65), deadline: "1800000000" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).txHash).toBe("0xtx");
    expect(submit).toHaveBeenCalledOnce();
  });

  it("rate-limits per wallet", async () => {
    const submit = vi.fn().mockResolvedValue("0xtx");
    const app = buildServer({ config: { ...baseCfg, ratelimit: { perIpPerMinute: 1000, perWalletPerMinute: 1 } }, submit });
    const payload = { bettor: "0x000000000000000000000000000000000000beef", matchId: "0x" + "01".repeat(32), outcome: 0, amount: "1", permit: { permitted: { token: "0x0000000000000000000000000000000000000000", amount: "1" }, nonce: "1", deadline: "1800000000" }, permitSig: "0x" + "11".repeat(65), userSig: "0x" + "22".repeat(65), deadline: "1800000000" };
    const a = await app.inject({ method: "POST", url: "/api/relay/bet", payload });
    const b = await app.inject({ method: "POST", url: "/api/relay/bet", payload });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(429);
  });

  it("returns 500 with error message when submit throws", async () => {
    const submit = vi.fn().mockRejectedValue(new Error("paymaster out of USDC"));
    const app = buildServer({ config: baseCfg, submit });
    const res = await app.inject({
      method: "POST",
      url: "/api/relay/bet",
      payload: { bettor: "0x000000000000000000000000000000000000beef", matchId: "0x" + "01".repeat(32), outcome: 0, amount: "1", permit: { permitted: { token: "0x0000000000000000000000000000000000000000", amount: "1" }, nonce: "1", deadline: "1800000000" }, permitSig: "0x" + "11".repeat(65), userSig: "0x" + "22".repeat(65), deadline: "1800000000" },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toContain("paymaster out of USDC");
  });
});
