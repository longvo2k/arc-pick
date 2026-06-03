import type { Hex } from "viem";
import { MatchStatus } from "@arc-pick/sdk/core";

export interface KnownMatch {
  matchId: Hex;
  status: MatchStatus;
  kickoff: bigint;
  resultPosted: boolean;
}

export interface DecideInput {
  now: bigint;
  knownMatches: KnownMatch[];
}

export interface Actions {
  close: Hex[];
  settle: Hex[];
}

export function decideActions(input: DecideInput): Actions {
  const close: Hex[] = [];
  const settle: Hex[] = [];
  for (const m of input.knownMatches) {
    if (m.status === MatchStatus.Open && input.now >= m.kickoff) close.push(m.matchId);
    if (m.status === MatchStatus.Closed && m.resultPosted) settle.push(m.matchId);
  }
  return { close, settle };
}
