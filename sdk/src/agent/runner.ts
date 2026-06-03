import type { Address, Hex } from "viem";
import type { OnchainReader } from "../server/onchain.js";
import type { Strategy, AgentContext, Bet, AgentStatus } from "./types.js";
import type { Store, AgentRecord } from "./store-memory.js";

export interface PlaceBetFn {
  (input: { matchId: Hex; outcome: 0 | 1 | 2; amount: bigint; ownerWallet: Address }): Promise<Hex>;
}

export interface ClaimForFn {
  (input: { matchId: Hex; user: Address }): Promise<Hex>;
}

export interface AgentRunnerInput {
  id: string;
  ownerWallet: Address;
  strategy: Strategy;
  capUsdc: bigint;
  expirySeconds: number;
  reader: OnchainReader;
  placeBet: PlaceBetFn;
  claimFor: ClaimForFn;
  store: Store;
  knownMatchIds: Hex[];
  tickSeconds?: number;
  now?: () => Date;
}

export class AgentRunner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private record: AgentRecord;
  private input: AgentRunnerInput;
  private tickMs: number;
  private now: () => Date;

  constructor(input: AgentRunnerInput) {
    this.input = input;
    this.tickMs = (input.tickSeconds ?? 60) * 1000;
    this.now = input.now ?? (() => new Date());
    this.record = {
      id: input.id,
      ownerWallet: input.ownerWallet,
      strategyName: input.strategy.name,
      capUsdc: input.capUsdc,
      spentUsdc: 0n,
      status: "spawning",
      expiresAt: new Date(this.now().getTime() + input.expirySeconds * 1000),
      bets: [],
    };
  }

  async start() {
    await this.input.store.insert(this.record);
    this.record.status = "active";
    await this.input.store.setStatus(this.record.id, "active");
    this.timer = setInterval(() => this.tick().catch(() => {}), this.tickMs);
    await this.tick();
  }

  async pause() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.record.status = "paused";
    await this.input.store.setStatus(this.record.id, "paused");
  }

  status(): AgentStatus { return this.record.status; }

  remainingCap(): bigint { return this.input.capUsdc - this.record.spentUsdc; }

  async tick() {
    if (this.record.status !== "active") return;
    if (this.now() >= this.record.expiresAt) {
      this.record.status = "expired";
      await this.input.store.setStatus(this.record.id, "expired");
      if (this.timer) clearInterval(this.timer);
      return;
    }
    const matches = await this.input.reader.listOpen(this.input.knownMatchIds);
    const pools = new Map();
    for (const m of matches) {
      pools.set(m.matchId, await this.input.reader.market(m.matchId));
    }
    const ctx: AgentContext = {
      ownerWallet: this.input.ownerWallet,
      capUsdc: this.remainingCap(),
      matchesOpen: matches,
      pools,
      history: this.record.bets,
      rng: Math.random,
      now: this.now,
    };
    const picks = await this.input.strategy.decide(ctx);
    for (const p of picks) {
      const remaining = this.remainingCap();
      if (p.amount <= 0n || p.amount > remaining) continue;
      try {
        const txHash = await this.input.placeBet({
          matchId: p.matchId,
          outcome: p.outcome as 0 | 1 | 2,
          amount: p.amount,
          ownerWallet: this.input.ownerWallet,
        });
        const bet: Bet = { matchId: p.matchId, outcome: p.outcome, amount: p.amount, placedAt: this.now(), txHash };
        await this.input.store.recordBet(this.record.id, bet);
        this.record.bets.push(bet);
        this.record.spentUsdc += p.amount;
      } catch {
        // skip pick on failure; agent stays active for next tick
      }
    }
    for (const bet of [...this.record.bets]) {
      const settled = await this.input.reader.isMatchSettled(bet.matchId);
      if (!settled) continue;
      const claimed = await this.input.reader.hasUserClaimed(bet.matchId, this.input.ownerWallet);
      if (claimed) continue;
      try {
        await this.input.claimFor({ matchId: bet.matchId, user: this.input.ownerWallet });
      } catch {
        // retry next tick
      }
    }
  }
}
