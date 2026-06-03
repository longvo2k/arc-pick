import { keccak256, toBytes, type Hex } from "viem";
import type { FootballDataClient } from "./footballData.js";

export interface UpsertInput { matchId: Hex; homeTeam: string; awayTeam: string; kickoff: bigint; }
export interface SubmitInput { matchId: Hex; homeScore: number; awayScore: number; signedAt: bigint; }

export interface RunOnceInput {
  fd: FootballDataClient;
  onUpsertMatch: (m: UpsertInput) => Promise<void>;
  onSubmitResult: (r: SubmitInput) => Promise<void>;
  now: () => Date;
  knownResults: Set<string>;
}

export function matchIdOf(fdId: number): Hex {
  return keccak256(toBytes(`FIFA-WC26-${fdId}`));
}

export async function runOnce(input: RunOnceInput): Promise<void> {
  const all = await input.fd.listMatches();
  for (const m of all) {
    const id = matchIdOf(m.id);
    if (m.status === "SCHEDULED") {
      await input.onUpsertMatch({
        matchId: id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        kickoff: BigInt(Math.floor(new Date(m.utcDate).getTime() / 1000)),
      });
    }
    if (m.status === "FINISHED" && m.score?.fullTime && !input.knownResults.has(id)) {
      await input.onSubmitResult({
        matchId: id,
        homeScore: m.score.fullTime.home,
        awayScore: m.score.fullTime.away,
        signedAt: BigInt(Math.floor(input.now().getTime() / 1000)),
      });
    }
  }
}
