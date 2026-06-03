import type { Address, Hex } from "viem";

export enum Outcome { Home = 0, Draw = 1, Away = 2 }
export enum MatchStatus { Unknown = 0, Open = 1, Closed = 2, Settled = 3, Voided = 4 }

export interface Match {
  matchId: Hex;
  homeTeam: string;
  awayTeam: string;
  kickoff: bigint;
  status: MatchStatus;
  winningOutcome: Outcome | null;
}

export interface MarketState {
  matchId: Hex;
  outcomeStake: [bigint, bigint, bigint];
  totalPool: bigint;
  impliedProb: [number, number, number];
}

export interface UserPosition {
  matchId: Hex;
  user: Address;
  stakes: [bigint, bigint, bigint];
  claimed: boolean;
  refunded: boolean;
}

export interface Pick {
  matchId: Hex;
  outcome: Outcome;
  amount: bigint;
  rationale?: string;
}

export function bytes32ToAscii(b: Hex): string {
  const hex = b.slice(2);
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substring(i, i + 2), 16);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

export function asciiToBytes32(s: string): Hex {
  if (s.length > 32) throw new Error("string too long for bytes32");
  let hex = "0x";
  for (let i = 0; i < s.length; i++) {
    hex += s.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return (hex + "0".repeat(64 - (hex.length - 2))) as Hex;
}
