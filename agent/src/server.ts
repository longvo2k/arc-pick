import Fastify, { type FastifyInstance } from "fastify";

export interface SpawnInput {
  ownerWallet: `0x${string}`;
  strategy: "conservative" | "aggressive" | "model-based";
  capUsdc: string;
  expirySeconds: number;
}

export interface AgentSummary {
  id: string;
  status: string;
  capUsdc: string;
  spentUsdc: string;
  strategy: string;
}

export interface AgentServerInput {
  spawn: (input: SpawnInput) => Promise<{ id: string }>;
  list: () => Promise<AgentSummary[]>;
  pause: (id: string) => Promise<void>;
}

export function buildAgentServer({ spawn, list, pause }: AgentServerInput): FastifyInstance {
  const app = Fastify({ logger: false, disableRequestLogging: true });

  app.post<{ Body: SpawnInput }>("/control/spawn", async (req, reply) => {
    try {
      const r = await spawn(req.body);
      return { id: r.id };
    } catch (err: any) {
      reply.code(400);
      return { error: err?.message ?? "spawn failed" };
    }
  });

  app.post<{ Params: { id: string } }>("/control/pause/:id", async (req, reply) => {
    try {
      await pause(req.params.id);
      return { paused: req.params.id };
    } catch (err: any) {
      reply.code(404);
      return { error: err?.message ?? "not found" };
    }
  });

  app.get("/agents", async () => {
    return { agents: await list() };
  });

  app.get("/healthz", async () => ({ ok: true }));

  return app;
}
