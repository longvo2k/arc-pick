import { encodeFunctionData, type Address, type Hex } from "viem";
import { BetVaultAbi } from "./abis.js";
import type { PermitTransferFromStruct } from "./permit2.js";

export function encodeBetCall(args: {
  matchId: Hex;
  outcome: 0 | 1 | 2;
  amount: bigint;
  permit: Pick<PermitTransferFromStruct, "permitted" | "nonce" | "deadline">;
  sig: Hex;
}): Hex {
  return encodeFunctionData({
    abi: BetVaultAbi,
    functionName: "placeBet",
    args: [args.matchId, args.outcome, args.amount, args.permit, args.sig],
  });
}

export function encodeClaimCall(matchId: Hex): Hex {
  return encodeFunctionData({ abi: BetVaultAbi, functionName: "claim", args: [matchId] });
}

export function encodeClaimForCall(matchId: Hex, user: Address): Hex {
  return encodeFunctionData({ abi: BetVaultAbi, functionName: "claimFor", args: [matchId, user] });
}

export function encodeRefundCall(matchId: Hex): Hex {
  return encodeFunctionData({ abi: BetVaultAbi, functionName: "refund", args: [matchId] });
}

export function encodeRefundForCall(matchId: Hex, user: Address): Hex {
  return encodeFunctionData({ abi: BetVaultAbi, functionName: "refundFor", args: [matchId, user] });
}

export function encodeAuthorizeAgentCall(agent: Address): Hex {
  return encodeFunctionData({ abi: BetVaultAbi, functionName: "authorizeAgent", args: [agent] });
}

export function encodeDeauthorizeAgentCall(agent: Address): Hex {
  return encodeFunctionData({ abi: BetVaultAbi, functionName: "deauthorizeAgent", args: [agent] });
}
