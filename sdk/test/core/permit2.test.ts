import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { buildBetPermit, buildAgentAllowance, encodeLockdownCall } from "../../src/core/permit2.js";

const owner = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

describe("buildBetPermit", () => {
  it("builds a typed-data envelope and produces a 65-byte sig", async () => {
    const result = await buildBetPermit({
      owner: owner.address,
      token: "0x3600000000000000000000000000000000000000",
      spender: "0x000000000000000000000000000000000000beef",
      amount: 10_000_000n,
      nonce: 42n,
      deadline: 1_800_000_000n,
      chainId: 5042002,
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      sign: (typedData) => owner.signTypedData(typedData),
    });
    expect(result.permit.permitted.token).toBe("0x3600000000000000000000000000000000000000");
    expect(result.permit.permitted.amount).toBe(10_000_000n);
    expect(result.permit.nonce).toBe(42n);
    expect(result.permit.deadline).toBe(1_800_000_000n);
    expect(result.sig).toMatch(/^0x[0-9a-f]{130}$/);
  });
});

describe("buildAgentAllowance", () => {
  it("builds an AllowanceTransfer envelope and signs", async () => {
    const result = await buildAgentAllowance({
      owner: owner.address,
      token: "0x3600000000000000000000000000000000000000",
      spender: "0x000000000000000000000000000000000000beef",
      capUsdc: 50_000_000n,
      expiration: 1_800_000_000,
      nonce: 0,
      chainId: 5042002,
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      sign: (typedData) => owner.signTypedData(typedData),
    });
    expect(result.allowance.details.token).toBe("0x3600000000000000000000000000000000000000");
    expect(result.allowance.details.amount).toBe(50_000_000n);
    expect(result.sig).toMatch(/^0x[0-9a-f]{130}$/);
  });
});

describe("encodeLockdownCall", () => {
  it("encodes lockdown for one (token, spender) pair", () => {
    const data = encodeLockdownCall([
      { token: "0x3600000000000000000000000000000000000000", spender: "0x000000000000000000000000000000000000beef" },
    ]);
    expect(data).toMatch(/^0x/);
    expect(data.length).toBeGreaterThan(10);
  });
});
