import type { Address } from "viem";
import type { AgentStatus, Bet } from "./types.js";

export interface AgentRecord {
  id: string;
  ownerWallet: Address;
  strategyName: string;
  capUsdc: bigint;
  spentUsdc: bigint;
  status: AgentStatus;
  expiresAt: Date;
  bets: Bet[];
}

export interface Store {
  insert: (record: AgentRecord) => Promise<void>;
  setStatus: (id: string, status: AgentStatus) => Promise<void>;
  recordBet: (id: string, bet: Bet) => Promise<void>;
  get: (id: string) => Promise<AgentRecord | null>;
  list: () => Promise<AgentRecord[]>;
}

export function inMemoryStore(): Store {
  const map = new Map<string, AgentRecord>();
  return {
    async insert(record) { map.set(record.id, record); },
    async setStatus(id, status) {
      const r = map.get(id); if (r) { r.status = status; }
    },
    async recordBet(id, bet) {
      const r = map.get(id); if (r) { r.bets.push(bet); r.spentUsdc += bet.amount; }
    },
    async get(id) { return map.get(id) ?? null; },
    async list() { return [...map.values()]; },
  };
}
