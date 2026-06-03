import type { Hex, Address } from "viem";

export interface SignResultInput {
  account: { signTypedData: (input: any) => Promise<Hex> };
  matchId: Hex;
  homeScore: number;
  awayScore: number;
  signedAt: bigint;
  chainId: number;
  oracleAddress: Address;
}

export async function signResult(input: SignResultInput): Promise<Hex> {
  return input.account.signTypedData({
    domain: {
      name: "arc-pick Oracle",
      version: "1",
      chainId: input.chainId,
      verifyingContract: input.oracleAddress,
    },
    types: {
      Result: [
        { name: "matchId", type: "bytes32" },
        { name: "homeScore", type: "uint8" },
        { name: "awayScore", type: "uint8" },
        { name: "signedAt", type: "uint64" },
        { name: "chainId", type: "uint256" },
      ],
    },
    primaryType: "Result",
    message: {
      matchId: input.matchId,
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      signedAt: input.signedAt,
      chainId: BigInt(input.chainId),
    },
  });
}
