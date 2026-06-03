import { hashTypedData, type Address, type Hex, type TypedData } from "viem";
import type { TypedDataPayload } from "./permit2.js";

export const SponsorBetTypes = {
  SponsorBet: [
    { name: "bettor", type: "address" },
    { name: "matchId", type: "bytes32" },
    { name: "outcome", type: "uint8" },
    { name: "amount", type: "uint128" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
    { name: "chainId", type: "uint256" },
  ],
} as const satisfies TypedData;

export function sponsorBetDomain({ chainId, paymaster }: { chainId: number; paymaster: Address }) {
  return {
    name: "arc-pick BetPaymaster",
    version: "1",
    chainId,
    verifyingContract: paymaster,
  };
}

export interface BuildSponsorBetSigInput {
  bettor: Address;
  matchId: Hex;
  outcome: 0 | 1 | 2;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
  chainId: number;
  paymaster: Address;
  sign: (typedData: TypedDataPayload) => Promise<Hex>;
}

export interface BuildSponsorBetSigResult {
  sig: Hex;
  digest: Hex;
}

export async function buildSponsorBetSig(input: BuildSponsorBetSigInput): Promise<BuildSponsorBetSigResult> {
  const message = {
    bettor: input.bettor,
    matchId: input.matchId,
    outcome: input.outcome,
    amount: input.amount,
    nonce: input.nonce,
    deadline: input.deadline,
    chainId: BigInt(input.chainId),
  };
  const typedData: TypedDataPayload = {
    domain: sponsorBetDomain({ chainId: input.chainId, paymaster: input.paymaster }),
    types: SponsorBetTypes,
    primaryType: "SponsorBet",
    message,
  };
  const digest = hashTypedData(typedData as any);
  const sig = await input.sign(typedData);
  return { sig, digest };
}
