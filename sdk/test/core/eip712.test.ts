import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { buildSponsorBetSig, sponsorBetDomain } from "../../src/core/eip712.js";

const bettor = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

describe("sponsorBetDomain", () => {
  it("matches the Solidity contract domain separator", () => {
    const d = sponsorBetDomain({ chainId: 5042002, paymaster: "0x000000000000000000000000000000000000beef" });
    expect(d.name).toBe("arc-pick BetPaymaster");
    expect(d.version).toBe("1");
    expect(d.chainId).toBe(5042002);
    expect(d.verifyingContract).toBe("0x000000000000000000000000000000000000beef");
  });
});

describe("buildSponsorBetSig", () => {
  it("produces a 65-byte sig and a 32-byte digest", async () => {
    const { sig, digest } = await buildSponsorBetSig({
      bettor: bettor.address,
      matchId: ("0x" + "ab".repeat(32)) as `0x${string}`,
      outcome: 0,
      amount: 1_000_000n,
      nonce: 7n,
      deadline: 1_800_000_000n,
      chainId: 5042002,
      paymaster: "0x000000000000000000000000000000000000beef",
      sign: (typedData) => bettor.signTypedData(typedData),
    });
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
    expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
