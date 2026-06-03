import type { Address, Hex, PublicClient } from "viem";
import {
  readMatch,
  readMarket,
  readUserPosition,
  listOpenMatches,
} from "../core/reads.js";
import { BetVaultAbi } from "../core/abis.js";
import type { ArcPickAddresses } from "../core/addresses.js";
import { MatchStatus } from "../core/types.js";

export interface OnchainReader {
  match: (matchId: Hex) => ReturnType<typeof readMatch>;
  market: (matchId: Hex) => ReturnType<typeof readMarket>;
  position: (wallet: Address, matchId: Hex) => ReturnType<typeof readUserPosition>;
  listOpen: (matchIds: Hex[], kickoffAfter?: bigint) => ReturnType<typeof listOpenMatches>;
  isMatchSettled: (matchId: Hex) => Promise<boolean>;
  hasUserClaimed: (matchId: Hex, user: Address) => Promise<boolean>;
}

export function createOnchainReader({ client, addrs }: { client: PublicClient; addrs: ArcPickAddresses }): OnchainReader {
  return {
    match: (matchId) => readMatch({ client, matchRegistry: addrs.matchRegistry, matchId }),
    market: (matchId) => readMarket({ client, market: addrs.market, matchId }),
    position: (wallet, matchId) =>
      readUserPosition({ client, market: addrs.market, betVault: addrs.betVault, wallet, matchId }),
    listOpen: (matchIds, kickoffAfter) =>
      listOpenMatches({ client, matchRegistry: addrs.matchRegistry, matchIds, kickoffAfter }),
    isMatchSettled: async (matchId) => {
      const m = await readMatch({ client, matchRegistry: addrs.matchRegistry, matchId });
      return m.status === MatchStatus.Settled;
    },
    hasUserClaimed: (matchId, user) =>
      client.readContract({
        address: addrs.betVault,
        abi: BetVaultAbi,
        functionName: "claimed",
        args: [matchId, user],
      }) as Promise<boolean>,
  };
}
