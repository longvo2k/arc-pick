import type { Hex, Address } from "viem";
import { log } from "./log.js";

export interface SeedBot {
  name: string;
  strategy: "conservative" | "aggressive" | "model-based";
  capUsdc: bigint;
  ownerWallet: Address;
  ownerPrivateKey: Hex;
}

export interface SpawnSink {
  spawn: (input: {
    ownerWallet: Address;
    strategy: SeedBot["strategy"];
    capUsdc: bigint;
    expirySeconds: number;
    label?: string;
  }) => Promise<{ id: string }>;
}

export async function spawnSeedBots(bots: SeedBot[], sink: SpawnSink) {
  for (const b of bots) {
    try {
      const r = await sink.spawn({
        ownerWallet: b.ownerWallet,
        strategy: b.strategy,
        capUsdc: b.capUsdc,
        expirySeconds: 30 * 24 * 3600,
        label: b.name,
      });
      log.info({ name: b.name, id: r.id, strategy: b.strategy, capUsdc: b.capUsdc.toString() }, "seed bot spawned");
    } catch (err: any) {
      log.error({ err: err?.message, name: b.name }, "seed bot spawn failed");
    }
  }
}
