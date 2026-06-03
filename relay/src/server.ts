import Fastify, { type FastifyInstance } from "fastify";
import type { Address, Hex } from "viem";
import type { SponsorBetPayload } from "@arc-pick/sdk/core";
import type { RelayConfig } from "./config.js";
import { createSlidingWindow } from "./ratelimit.js";
import { log } from "./log.js";

export interface SubmitFn {
  (payload: SponsorBetPayload): Promise<Hex>;
}

export interface BuildServerInput {
  config: RelayConfig;
  submit: SubmitFn;
}

export function buildServer({ config, submit }: BuildServerInput): FastifyInstance {
  const app = Fastify({ logger: false, disableRequestLogging: true });
  const ipLimit = createSlidingWindow({ limit: config.ratelimit.perIpPerMinute, windowMs: 60_000 });
  const walletLimit = createSlidingWindow({ limit: config.ratelimit.perWalletPerMinute, windowMs: 60_000 });

  app.post<{ Body: SponsorBetPayload }>("/api/relay/bet", async (req, reply) => {
    const ip = req.ip ?? "unknown";
    const bettor = req.body?.bettor as Address | undefined;
    if (!bettor) {
      reply.code(400);
      return { error: "missing bettor" };
    }
    if (!ipLimit.allow(ip) || !walletLimit.allow(bettor)) {
      reply.code(429);
      return { error: "rate limited" };
    }
    try {
      const txHash = await submit(req.body);
      log.info({ bettor, txHash }, "sponsored");
      return { txHash };
    } catch (err: any) {
      log.error({ err: err?.message }, "sponsor failed");
      reply.code(500);
      return { error: err?.message ?? "unknown" };
    }
  });

  app.get("/healthz", async () => ({ ok: true }));

  return app;
}
