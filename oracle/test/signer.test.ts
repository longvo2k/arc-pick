import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { signResult } from "../src/signer.js";
import { keccak256, toBytes } from "viem";

const key = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

describe("signResult", () => {
  it("returns a 65-byte hex sig", async () => {
    const signer = privateKeyToAccount(key);
    const matchId = keccak256(toBytes("FIFA-WC26-1"));
    const sig = await signResult({
      account: signer,
      matchId,
      homeScore: 2, awayScore: 1, signedAt: 1_800_000_000n,
      chainId: 5042002,
      oracleAddress: "0x000000000000000000000000000000000000beef",
    });
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
  });
});
