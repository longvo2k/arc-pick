import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import { BetVaultAbi } from "../../src/core/abis.js";
import { encodeBetCall, encodeClaimCall, encodeClaimForCall, encodeRefundCall } from "../../src/core/calldata.js";

describe("encodeBetCall", () => {
  it("roundtrips through viem decodeFunctionData", () => {
    const permit = {
      permitted: { token: "0x3600000000000000000000000000000000000000", amount: 10_000_000n },
      nonce: 1n,
      deadline: 1_800_000_000n,
    } as const;
    const data = encodeBetCall({
      matchId: ("0x" + "ab".repeat(32)) as `0x${string}`,
      outcome: 0,
      amount: 10_000_000n,
      permit,
      sig: ("0x" + "11".repeat(65)) as `0x${string}`,
    });
    const decoded = decodeFunctionData({ abi: BetVaultAbi, data });
    expect(decoded.functionName).toBe("placeBet");
  });
});

describe("encodeClaimCall", () => {
  it("encodes claim(matchId)", () => {
    const data = encodeClaimCall(("0x" + "01".repeat(32)) as `0x${string}`);
    const decoded = decodeFunctionData({ abi: BetVaultAbi, data });
    expect(decoded.functionName).toBe("claim");
  });
});

describe("encodeClaimForCall", () => {
  it("encodes claimFor(matchId, user)", () => {
    const data = encodeClaimForCall(("0x" + "01".repeat(32)) as `0x${string}`, "0x0000000000000000000000000000000000000001");
    const decoded = decodeFunctionData({ abi: BetVaultAbi, data });
    expect(decoded.functionName).toBe("claimFor");
  });
});

describe("encodeRefundCall", () => {
  it("encodes refund(matchId)", () => {
    const data = encodeRefundCall(("0x" + "01".repeat(32)) as `0x${string}`);
    const decoded = decodeFunctionData({ abi: BetVaultAbi, data });
    expect(decoded.functionName).toBe("refund");
  });
});
