import type { Address, Hex, PublicClient } from "viem";
import { MatchRegistryAbi, MarketAbi, BetVaultAbi } from "./abis.js";
import {
  type Match,
  type MarketState,
  type UserPosition,
  MatchStatus,
  Outcome,
  bytes32ToAscii,
} from "./types.js";

export interface ReadMatchInput {
  client: PublicClient;
  matchRegistry: Address;
  matchId: Hex;
}

export async function readMatch({ client, matchRegistry, matchId }: ReadMatchInput): Promise<Match> {
  const result = (await client.readContract({
    address: matchRegistry,
    abi: MatchRegistryAbi,
    functionName: "matches",
    args: [matchId],
  })) as readonly [Hex, Hex, bigint, number, number];
  const [home, away, kickoff, statusRaw, winRaw] = result;
  const status = statusRaw as MatchStatus;
  const winningOutcome =
    status === MatchStatus.Settled ? ((winRaw as Outcome)) : null;
  return {
    matchId,
    homeTeam: bytes32ToAscii(home),
    awayTeam: bytes32ToAscii(away),
    kickoff,
    status,
    winningOutcome,
  };
}

export interface ReadMarketInput {
  client: PublicClient;
  market: Address;
  matchId: Hex;
}

export async function readMarket({ client, market, matchId }: ReadMarketInput): Promise<MarketState> {
  const stakes = await Promise.all(
    [0, 1, 2].map((o) =>
      client.readContract({
        address: market,
        abi: MarketAbi,
        functionName: "outcomeStake",
        args: [matchId, o],
      }) as Promise<bigint>,
    ),
  );
  const outcomeStake: [bigint, bigint, bigint] = [stakes[0]!, stakes[1]!, stakes[2]!];
  const totalPool = outcomeStake[0] + outcomeStake[1] + outcomeStake[2];
  let impliedProb: [number, number, number];
  if (totalPool === 0n) {
    impliedProb = [0, 0, 0];
  } else {
    const t = Number(totalPool);
    impliedProb = [
      Number(outcomeStake[0]) / t,
      Number(outcomeStake[1]) / t,
      Number(outcomeStake[2]) / t,
    ];
  }
  return { matchId, outcomeStake, totalPool, impliedProb };
}

export interface ReadUserPositionInput {
  client: PublicClient;
  market: Address;
  betVault: Address;
  wallet: Address;
  matchId: Hex;
}

export async function readUserPosition({
  client,
  market,
  betVault,
  wallet,
  matchId,
}: ReadUserPositionInput): Promise<UserPosition> {
  const [s0, s1, s2, claimed, refunded] = await Promise.all([
    client.readContract({ address: market, abi: MarketAbi, functionName: "userStake", args: [matchId, wallet, 0] }) as Promise<bigint>,
    client.readContract({ address: market, abi: MarketAbi, functionName: "userStake", args: [matchId, wallet, 1] }) as Promise<bigint>,
    client.readContract({ address: market, abi: MarketAbi, functionName: "userStake", args: [matchId, wallet, 2] }) as Promise<bigint>,
    client.readContract({ address: betVault, abi: BetVaultAbi, functionName: "claimed", args: [matchId, wallet] }) as Promise<boolean>,
    client.readContract({ address: betVault, abi: BetVaultAbi, functionName: "refunded", args: [matchId, wallet] }) as Promise<boolean>,
  ]);
  return { matchId, user: wallet, stakes: [s0, s1, s2], claimed, refunded };
}

export interface ListOpenMatchesInput {
  client: PublicClient;
  matchRegistry: Address;
  matchIds: Hex[];
  kickoffAfter?: bigint;
}

export async function listOpenMatches({
  client,
  matchRegistry,
  matchIds,
  kickoffAfter,
}: ListOpenMatchesInput): Promise<Match[]> {
  const floor = kickoffAfter ?? BigInt(Math.floor(Date.now() / 1000));
  const matches = await Promise.all(
    matchIds.map((id) => readMatch({ client, matchRegistry, matchId: id })),
  );
  return matches.filter((m) => m.status === MatchStatus.Open && m.kickoff > floor);
}
