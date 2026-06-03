# arc-pick P3: Off-chain services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the four off-chain services (oracle, keeper, relay, agent runtime) that bridge real-world data, gasless human bets, and autonomous agent flows to the P1 contracts via the P2 SDK. All four ship as Node 20 services in pnpm workspace packages, dockerized, wired into the existing docker-compose stack.

**Architecture:** Each service is a small Fastify or plain-Node process that imports `@arc-pick/sdk` (workspace dep) and drives a single concern. The oracle polls football-data.org → signs EIP-712 results → posts. The keeper polls the registry + oracle → calls `closeMarket` / `settleMarket`. The relay forwards user-signed sponsor requests to BetPaymaster. The agent runtime hosts one `AgentRunner` per (owner, strategy) and exposes a control plane HTTP API so the frontend can spawn / pause agents. All services share a thin `internal/` helper for viem clients, log JSON, and graceful shutdown.

**Tech Stack:**

- Node 20.x ESM, TypeScript 5.6, viem 2.x, `@arc-pick/sdk` (workspace `*`).
- Fastify 5.x for HTTP services. `pino` for structured logs.
- `@anthropic-ai/sdk` only in the agent service (model-based strategy).
- Vitest 2.x for unit tests. Each service has a Dockerfile + entry in `docker-compose.yml`.
- The relay holds a Permit2-compatible hot key funded with anvil's deterministic accounts in compose dev.

**Out of scope for P3:**

- Postgres-backed agent Store. The agent runtime ships an in-memory Store (from P2 SDK); production-grade Store is future work.
- Real Circle Nanopayments wiring. The agent constructs the `NanopaymentClient` with `nanopayClient: undefined` so it always falls back to `USDC.transferFrom` — honest until Circle's testnet endpoints are confirmed.
- Real football-data.org calls in CI. The oracle service injects a `FootballDataClient` interface; CI tests use a fixture fake.
- Authentication on the control planes. The relay's `/api/relay/bet` and the agent's `/control/*` are open in compose dev; production hardening is future work.

---

## File Structure

```
arc-pick/
├── relay/                                  Fastify paymaster meta-tx forwarder
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── src/
│   │   ├── index.ts                        Process entry: parse env, start Fastify
│   │   ├── server.ts                       Fastify app factory (testable)
│   │   ├── config.ts                       Env parsing (zod-free; small hand-rolled schema)
│   │   ├── ratelimit.ts                    Sliding-window per-IP + per-bettor
│   │   └── log.ts                          pino instance with redaction
│   └── test/
│       ├── server.test.ts                  Vitest + supertest-equivalent (fastify.inject)
│       └── ratelimit.test.ts
├── oracle/                                 football-data.org poller + signer
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── src/
│   │   ├── index.ts                        Process entry: schedule + start
│   │   ├── footballData.ts                 FootballDataClient interface + http impl + fixture fake
│   │   ├── poller.ts                       Match ingestion + result signing loop
│   │   ├── signer.ts                       EIP-712 sign + submit (uses SDK eip712.ts pattern)
│   │   ├── config.ts
│   │   └── log.ts
│   └── test/
│       ├── poller.test.ts                  Drives poller against a fake FootballDataClient
│       └── signer.test.ts                  Sig roundtrip
├── keeper/                                 Market lifecycle driver
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── src/
│   │   ├── index.ts                        Process entry: tick loop
│   │   ├── tick.ts                         Pure function: given state, returns actions to take
│   │   ├── config.ts
│   │   └── log.ts
│   └── test/
│       └── tick.test.ts
├── agent/                                  Multi-tenant agent runtime
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── src/
│   │   ├── index.ts                        Process entry: spawn demo bots + start control plane
│   │   ├── server.ts                       Fastify control plane (POST /control/spawn, /pause, GET /agents)
│   │   ├── factory.ts                      Builds AgentRunner from spawn input (wires SDK pieces)
│   │   ├── seedBots.ts                     Spawns StatHead + Vibes at startup with seed wallets
│   │   ├── config.ts
│   │   └── log.ts
│   └── test/
│       ├── server.test.ts                  Spawn / pause / list routes via fastify.inject
│       └── factory.test.ts                 Wires fake reader/placeBet for a runner
└── docker-compose.yml                      Extended with 4 new services + deps
```

A few additional touch-ups land in this plan:

- Root `package.json` gets `test:services`, `build:services` scripts.
- `docker-compose.yml` adds `relay`, `oracle`, `keeper`, `agent` services that depend on `seed` (so the deployed contracts exist).
- `compose-init/`: a small `wait-for-deploy.sh` helper that blocks until `deployed.env` is present (the existing deploy step writes it).

---

## Task 1: Repo-wide service scaffolding

**Files:**

- Modify: `/Users/long/Code/arc-pick/package.json` (add service scripts)
- Create: `/Users/long/Code/arc-pick/compose-init/wait-for-deploy.sh`

- [ ] **Step 1: Add scripts to root `package.json`**

Replace the `scripts` block with:

```json
"scripts": {
  "build:contracts": "forge build --root contracts",
  "test:contracts": "forge test --root contracts -vv",
  "coverage:contracts": "forge coverage --root contracts --report summary --report lcov",
  "build:sdk": "pnpm --filter @arc-pick/sdk build",
  "test:sdk": "pnpm --filter @arc-pick/sdk test",
  "coverage:sdk": "pnpm --filter @arc-pick/sdk coverage",
  "build:services": "pnpm -r --filter './relay' --filter './oracle' --filter './keeper' --filter './agent' build",
  "test:services": "pnpm -r --filter './relay' --filter './oracle' --filter './keeper' --filter './agent' test",
  "compose:up": "docker compose up -d",
  "compose:down": "docker compose down -v"
}
```

- [ ] **Step 2: Create `compose-init/wait-for-deploy.sh`** (used by every service container so the contracts are deployed before they boot)

```bash
#!/usr/bin/env bash
set -euo pipefail
echo "Waiting for /work/deployed.env ..."
until [ -f /work/deployed.env ]; do sleep 1; done
echo "deployed.env present."
```

- [ ] **Step 3: Make executable + commit**

```bash
chmod +x /Users/long/Code/arc-pick/compose-init/wait-for-deploy.sh
cd /Users/long/Code/arc-pick
git add package.json compose-init/wait-for-deploy.sh
git commit -m "chore(services): root scripts + wait-for-deploy helper"
```

---

## Task 2: Relay scaffold

**Files:**

- Create: `relay/package.json`, `relay/tsconfig.json`, `relay/Dockerfile`, `relay/src/log.ts`, `relay/src/config.ts`

- [ ] **Step 1: `relay/package.json`**

```json
{
  "name": "@arc-pick/relay",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@arc-pick/sdk": "workspace:*",
    "fastify": "^5.0.0",
    "pino": "^9.4.0",
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "engines": { "node": ">=20.11.0" }
}
```

- [ ] **Step 2: `relay/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: `relay/Dockerfile`**

```dockerfile
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /work
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml /work/
COPY sdk/ /work/sdk/
COPY relay/ /work/relay/
COPY compose-init/wait-for-deploy.sh /usr/local/bin/wait-for-deploy
RUN chmod +x /usr/local/bin/wait-for-deploy && pnpm install --frozen-lockfile
RUN pnpm --filter @arc-pick/sdk build && pnpm --filter @arc-pick/relay build
ENTRYPOINT ["sh", "-c", "wait-for-deploy && node /work/relay/dist/index.js"]
```

- [ ] **Step 4: `relay/src/log.ts`**

```ts
import pino from "pino";
export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["payload.permitSig", "payload.userSig"],
  formatters: { level: (label) => ({ level: label }) },
});
```

- [ ] **Step 5: `relay/src/config.ts`**

```ts
export interface RelayConfig {
  port: number;
  chainId: number;
  rpcUrl: string;
  paymasterAddress: `0x${string}`;
  relayerPrivateKey: `0x${string}`;
  ratelimit: { perIpPerMinute: number; perWalletPerMinute: number };
}

function required(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
}

export function loadConfig(): RelayConfig {
  return {
    port: parseInt(process.env.PORT ?? "7787", 10),
    chainId: parseInt(required("CHAIN_ID"), 10),
    rpcUrl: required("RPC_URL"),
    paymasterAddress: required("BET_PAYMASTER_ADDRESS") as `0x${string}`,
    relayerPrivateKey: required("RELAYER_PRIVATE_KEY") as `0x${string}`,
    ratelimit: {
      perIpPerMinute: parseInt(process.env.RATE_LIMIT_IP_PER_MINUTE ?? "60", 10),
      perWalletPerMinute: parseInt(process.env.RATE_LIMIT_WALLET_PER_MINUTE ?? "5", 10),
    },
  };
}
```

- [ ] **Step 6: Install + verify**

```bash
cd /Users/long/Code/arc-pick
pnpm install
pnpm --filter @arc-pick/relay typecheck
```

Expected: typecheck passes (no src/index.ts yet — but config + log don't error).

- [ ] **Step 7: Commit**

```bash
git add relay/ pnpm-lock.yaml
git commit -m "chore(relay): scaffold @arc-pick/relay package"
```

---

## Task 3: Relay rate limit + server

**Files:**

- Create: `relay/src/ratelimit.ts`
- Create: `relay/src/server.ts`
- Create: `relay/src/index.ts`
- Create: `relay/test/ratelimit.test.ts`
- Create: `relay/test/server.test.ts`

- [ ] **Step 1: Failing tests**

`relay/test/ratelimit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createSlidingWindow } from "../src/ratelimit.js";

describe("createSlidingWindow", () => {
  let window: ReturnType<typeof createSlidingWindow>;
  let now = 0;
  beforeEach(() => { now = 0; window = createSlidingWindow({ limit: 3, windowMs: 1000, now: () => now }); });

  it("allows up to limit within window", () => {
    expect(window.allow("a")).toBe(true);
    expect(window.allow("a")).toBe(true);
    expect(window.allow("a")).toBe(true);
    expect(window.allow("a")).toBe(false);
  });

  it("releases capacity after window passes", () => {
    window.allow("a"); window.allow("a"); window.allow("a");
    now += 1001;
    expect(window.allow("a")).toBe(true);
  });

  it("keys are independent", () => {
    window.allow("a"); window.allow("a"); window.allow("a");
    expect(window.allow("b")).toBe(true);
  });
});
```

`relay/test/server.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { buildServer } from "../src/server.js";

const baseCfg = {
  port: 0,
  chainId: 5042002,
  rpcUrl: "http://anvil:8545",
  paymasterAddress: "0x000000000000000000000000000000000000beef" as `0x${string}`,
  relayerPrivateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`,
  ratelimit: { perIpPerMinute: 60, perWalletPerMinute: 5 },
};

describe("relay /api/relay/bet", () => {
  it("returns txHash on successful sponsor", async () => {
    const submit = vi.fn().mockResolvedValue("0xtx");
    const app = buildServer({ config: baseCfg, submit });
    const res = await app.inject({
      method: "POST",
      url: "/api/relay/bet",
      payload: { bettor: "0x000000000000000000000000000000000000beef", matchId: "0x" + "01".repeat(32), outcome: 0, amount: "10000000", permit: { permitted: { token: "0x0000000000000000000000000000000000000000", amount: "10000000" }, nonce: "1", deadline: "1800000000" }, permitSig: "0x" + "11".repeat(65), userSig: "0x" + "22".repeat(65), deadline: "1800000000" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).txHash).toBe("0xtx");
    expect(submit).toHaveBeenCalledOnce();
  });

  it("rate-limits per wallet", async () => {
    const submit = vi.fn().mockResolvedValue("0xtx");
    const app = buildServer({ config: { ...baseCfg, ratelimit: { perIpPerMinute: 1000, perWalletPerMinute: 1 } }, submit });
    const payload = { bettor: "0x000000000000000000000000000000000000beef", matchId: "0x" + "01".repeat(32), outcome: 0, amount: "1", permit: { permitted: { token: "0x0000000000000000000000000000000000000000", amount: "1" }, nonce: "1", deadline: "1800000000" }, permitSig: "0x" + "11".repeat(65), userSig: "0x" + "22".repeat(65), deadline: "1800000000" };
    const a = await app.inject({ method: "POST", url: "/api/relay/bet", payload });
    const b = await app.inject({ method: "POST", url: "/api/relay/bet", payload });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(429);
  });

  it("returns 500 with error message when submit throws", async () => {
    const submit = vi.fn().mockRejectedValue(new Error("paymaster out of USDC"));
    const app = buildServer({ config: baseCfg, submit });
    const res = await app.inject({
      method: "POST",
      url: "/api/relay/bet",
      payload: { bettor: "0x000000000000000000000000000000000000beef", matchId: "0x" + "01".repeat(32), outcome: 0, amount: "1", permit: { permitted: { token: "0x0000000000000000000000000000000000000000", amount: "1" }, nonce: "1", deadline: "1800000000" }, permitSig: "0x" + "11".repeat(65), userSig: "0x" + "22".repeat(65), deadline: "1800000000" },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toContain("paymaster out of USDC");
  });
});
```

- [ ] **Step 2: Implement `relay/src/ratelimit.ts`**

```ts
export interface SlidingWindowInput {
  limit: number;
  windowMs: number;
  now?: () => number;
}

export interface SlidingWindow {
  allow: (key: string) => boolean;
}

export function createSlidingWindow({ limit, windowMs, now }: SlidingWindowInput): SlidingWindow {
  const buckets = new Map<string, number[]>();
  const clock = now ?? (() => Date.now());
  return {
    allow(key: string) {
      const t = clock();
      const arr = buckets.get(key) ?? [];
      const fresh = arr.filter((ts) => t - ts < windowMs);
      if (fresh.length >= limit) {
        buckets.set(key, fresh);
        return false;
      }
      fresh.push(t);
      buckets.set(key, fresh);
      return true;
    },
  };
}
```

- [ ] **Step 3: Implement `relay/src/server.ts`**

```ts
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
```

- [ ] **Step 4: Implement `relay/src/index.ts`**

```ts
import { createPublicClient, createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BetPaymasterAbi, arcTestnet, type SponsorBetPayload } from "@arc-pick/sdk/core";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";
import { log } from "./log.js";

const cfg = loadConfig();
const chain = { ...arcTestnet, id: cfg.chainId, rpcUrls: { default: { http: [cfg.rpcUrl] }, public: { http: [cfg.rpcUrl] } } };
const account = privateKeyToAccount(cfg.relayerPrivateKey);
const wallet = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });
const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });

async function submit(payload: SponsorBetPayload): Promise<`0x${string}`> {
  const data = encodeFunctionData({
    abi: BetPaymasterAbi,
    functionName: "sponsorBet",
    args: [
      payload.bettor,
      payload.matchId,
      payload.outcome,
      BigInt(payload.amount),
      { permitted: { token: payload.permit.permitted.token, amount: BigInt(payload.permit.permitted.amount) }, nonce: BigInt(payload.permit.nonce), deadline: BigInt(payload.permit.deadline) },
      payload.permitSig,
      payload.userSig,
      BigInt(payload.deadline),
    ],
  });
  const txHash = await wallet.sendTransaction({ to: cfg.paymasterAddress, data, account, chain });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

const app = buildServer({ config: cfg, submit });
app.listen({ port: cfg.port, host: "0.0.0.0" }).then(() => {
  log.info({ port: cfg.port }, "relay listening");
}).catch((err) => {
  log.error({ err: err.message }, "failed to start"); process.exit(1);
});
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/long/Code/arc-pick
pnpm install
pnpm --filter @arc-pick/relay test 2>&1 | tail -8
```

Expected: 6 tests pass (3 rate limit + 3 server).

- [ ] **Step 6: Commit**

```bash
git add relay/src/ relay/test/ pnpm-lock.yaml
git commit -m "feat(relay): Fastify sponsor forwarder with sliding-window rate limit"
```

---

## Task 4: Oracle scaffold + football-data client

**Files:**

- Create: `oracle/package.json`, `oracle/tsconfig.json`, `oracle/Dockerfile`, `oracle/src/log.ts`, `oracle/src/config.ts`, `oracle/src/footballData.ts`, `oracle/test/footballData.test.ts`

- [ ] **Step 1: `oracle/package.json`**

```json
{
  "name": "@arc-pick/oracle",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@arc-pick/sdk": "workspace:*",
    "pino": "^9.4.0",
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "engines": { "node": ">=20.11.0" }
}
```

- [ ] **Step 2: `oracle/tsconfig.json`** (same shape as relay's — copy verbatim)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: `oracle/Dockerfile`**

```dockerfile
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /work
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml /work/
COPY sdk/ /work/sdk/
COPY oracle/ /work/oracle/
COPY compose-init/wait-for-deploy.sh /usr/local/bin/wait-for-deploy
RUN chmod +x /usr/local/bin/wait-for-deploy && pnpm install --frozen-lockfile
RUN pnpm --filter @arc-pick/sdk build && pnpm --filter @arc-pick/oracle build
ENTRYPOINT ["sh", "-c", "wait-for-deploy && node /work/oracle/dist/index.js"]
```

- [ ] **Step 4: `oracle/src/log.ts`** and `oracle/src/config.ts` (paste shape from relay; differ in env var names)

```ts
// log.ts
import pino from "pino";
export const log = pino({ level: process.env.LOG_LEVEL ?? "info", formatters: { level: (l) => ({ level: l }) } });
```

```ts
// config.ts
export interface OracleConfig {
  chainId: number;
  rpcUrl: string;
  registry: `0x${string}`;
  oracle: `0x${string}`;
  signerPrivateKey: `0x${string}`;
  submitterPrivateKey: `0x${string}`;
  footballDataBase: string;
  footballDataApiKey?: string;
  pollSeconds: number;
}

function required(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
}

export function loadConfig(): OracleConfig {
  return {
    chainId: parseInt(required("CHAIN_ID"), 10),
    rpcUrl: required("RPC_URL"),
    registry: required("MATCH_REGISTRY_ADDRESS") as `0x${string}`,
    oracle: required("ORACLE_ADDRESS") as `0x${string}`,
    signerPrivateKey: required("ORACLE_SIGNER_PRIVATE_KEY") as `0x${string}`,
    submitterPrivateKey: required("ORACLE_SUBMITTER_PRIVATE_KEY") as `0x${string}`,
    footballDataBase: process.env.FOOTBALL_DATA_API_BASE ?? "https://api.football-data.org/v4",
    footballDataApiKey: process.env.FOOTBALL_DATA_API_KEY,
    pollSeconds: parseInt(process.env.POLL_INTERVAL_SECONDS ?? "600", 10),
  };
}
```

- [ ] **Step 5: Failing test for football-data client**

`oracle/test/footballData.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createFakeFootballDataClient } from "../src/footballData.js";

describe("createFakeFootballDataClient", () => {
  it("returns the seeded matches", async () => {
    const c = createFakeFootballDataClient({
      matches: [
        { id: 1, homeTeam: "ARG", awayTeam: "MEX", utcDate: "2026-06-11T19:00:00Z", status: "SCHEDULED" },
        { id: 2, homeTeam: "FRA", awayTeam: "DEN", utcDate: "2026-06-12T19:00:00Z", status: "FINISHED", score: { fullTime: { home: 2, away: 1 } } },
      ],
    });
    const r = await c.listMatches();
    expect(r.length).toBe(2);
    expect(r[0]!.homeTeam).toBe("ARG");
    expect(r[1]!.score?.fullTime.home).toBe(2);
  });

  it("filters by status", async () => {
    const c = createFakeFootballDataClient({
      matches: [
        { id: 1, homeTeam: "ARG", awayTeam: "MEX", utcDate: "2026-06-11T19:00:00Z", status: "SCHEDULED" },
        { id: 2, homeTeam: "FRA", awayTeam: "DEN", utcDate: "2026-06-12T19:00:00Z", status: "FINISHED", score: { fullTime: { home: 2, away: 1 } } },
      ],
    });
    const r = await c.listMatches({ status: "FINISHED" });
    expect(r.length).toBe(1);
    expect(r[0]!.id).toBe(2);
  });
});
```

- [ ] **Step 6: Implement `oracle/src/footballData.ts`**

```ts
export interface FdMatch {
  id: number;
  homeTeam: string;     // team code or short name
  awayTeam: string;
  utcDate: string;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED";
  score?: { fullTime: { home: number; away: number } };
}

export interface ListMatchesOpts { status?: FdMatch["status"]; }

export interface FootballDataClient {
  listMatches(opts?: ListMatchesOpts): Promise<FdMatch[]>;
}

export function createFakeFootballDataClient({ matches }: { matches: FdMatch[] }): FootballDataClient {
  return {
    async listMatches(opts) {
      if (opts?.status) return matches.filter((m) => m.status === opts.status);
      return matches;
    },
  };
}

export interface HttpClientOpts {
  base: string;
  apiKey?: string;
  competition?: string; // e.g. "WC"
  fetchImpl?: typeof fetch;
}

export function createHttpFootballDataClient(opts: HttpClientOpts): FootballDataClient {
  const comp = opts.competition ?? "WC";
  const f = opts.fetchImpl ?? fetch;
  return {
    async listMatches(qopts) {
      const url = `${opts.base}/competitions/${comp}/matches${qopts?.status ? `?status=${qopts.status}` : ""}`;
      const headers: Record<string, string> = {};
      if (opts.apiKey) headers["X-Auth-Token"] = opts.apiKey;
      const res = await f(url, { headers });
      if (!res.ok) throw new Error(`football-data HTTP ${res.status}`);
      const body = await res.json() as { matches: any[] };
      return body.matches.map((m: any) => ({
        id: m.id,
        homeTeam: m.homeTeam?.tla ?? m.homeTeam?.shortName ?? m.homeTeam?.name ?? "?",
        awayTeam: m.awayTeam?.tla ?? m.awayTeam?.shortName ?? m.awayTeam?.name ?? "?",
        utcDate: m.utcDate,
        status: m.status,
        score: m.score?.fullTime?.home != null
          ? { fullTime: { home: m.score.fullTime.home, away: m.score.fullTime.away } }
          : undefined,
      }));
    },
  };
}
```

- [ ] **Step 7: Run tests**

```bash
cd /Users/long/Code/arc-pick
pnpm install
pnpm --filter @arc-pick/oracle test test/footballData.test.ts 2>&1 | tail -6
```

Expected: 2 tests pass.

- [ ] **Step 8: Commit**

```bash
git add oracle/ pnpm-lock.yaml
git commit -m "feat(oracle): scaffold + football-data.org client (HTTP + fake)"
```

---

## Task 5: Oracle poller + signer

**Files:**

- Create: `oracle/src/signer.ts`
- Create: `oracle/src/poller.ts`
- Create: `oracle/src/index.ts`
- Create: `oracle/test/poller.test.ts`
- Create: `oracle/test/signer.test.ts`

- [ ] **Step 1: Test `oracle/test/signer.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { signResult } from "../src/signer.js";
import { keccak256, toBytes } from "viem";

const key = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

describe("signResult", () => {
  it("returns a 65-byte hex sig", async () => {
    const signer = privateKeyToAccount(key);
    const matchId = keccak256(toBytes("FIFA-WC26-1"));
    const sig = await signResult({
      account: signer,
      matchId,
      homeScore: 2, awayScore: 1, signedAt: 1_800_000_000n,
      chainId: 5042002,
      oracleAddress: "0x000000000000000000000000000000000000beef",
    });
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
  });
});
```

- [ ] **Step 2: Implement `oracle/src/signer.ts`**

```ts
import type { Hex, Address } from "viem";

export interface SignResultInput {
  account: { signTypedData: (input: any) => Promise<Hex> };
  matchId: Hex;
  homeScore: number;
  awayScore: number;
  signedAt: bigint;
  chainId: number;
  oracleAddress: Address;
}

export async function signResult(input: SignResultInput): Promise<Hex> {
  return input.account.signTypedData({
    domain: {
      name: "arc-pick Oracle",
      version: "1",
      chainId: input.chainId,
      verifyingContract: input.oracleAddress,
    },
    types: {
      Result: [
        { name: "matchId", type: "bytes32" },
        { name: "homeScore", type: "uint8" },
        { name: "awayScore", type: "uint8" },
        { name: "signedAt", type: "uint64" },
        { name: "chainId", type: "uint256" },
      ],
    },
    primaryType: "Result",
    message: {
      matchId: input.matchId,
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      signedAt: input.signedAt,
      chainId: BigInt(input.chainId),
    },
  });
}
```

- [ ] **Step 3: Test `oracle/test/poller.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { runOnce } from "../src/poller.js";
import { createFakeFootballDataClient } from "../src/footballData.js";

describe("runOnce", () => {
  it("calls upsertMatch for SCHEDULED and submitResult for FINISHED matches", async () => {
    const fd = createFakeFootballDataClient({
      matches: [
        { id: 1, homeTeam: "ARG", awayTeam: "MEX", utcDate: "2026-06-11T19:00:00Z", status: "SCHEDULED" },
        { id: 2, homeTeam: "FRA", awayTeam: "DEN", utcDate: "2026-06-12T19:00:00Z", status: "FINISHED", score: { fullTime: { home: 2, away: 1 } } },
      ],
    });
    const upserts: any[] = [];
    const submits: any[] = [];
    await runOnce({
      fd,
      onUpsertMatch: async (m) => { upserts.push(m); },
      onSubmitResult: async (r) => { submits.push(r); },
      now: () => new Date("2026-06-13T00:00:00Z"),
      knownResults: new Set<string>(),
    });
    expect(upserts.length).toBe(2);
    expect(submits.length).toBe(1);
    expect(submits[0].matchId).toBeDefined();
    expect(submits[0].homeScore).toBe(2);
  });

  it("skips matches whose result was already submitted", async () => {
    const fd = createFakeFootballDataClient({
      matches: [{ id: 2, homeTeam: "FRA", awayTeam: "DEN", utcDate: "2026-06-12T19:00:00Z", status: "FINISHED", score: { fullTime: { home: 2, away: 1 } } }],
    });
    const submits: any[] = [];
    const known = new Set<string>();
    await runOnce({
      fd, onUpsertMatch: async () => {}, onSubmitResult: async (r) => { submits.push(r); known.add(r.matchId); },
      now: () => new Date(), knownResults: known,
    });
    expect(submits.length).toBe(1);
    submits.length = 0;
    await runOnce({
      fd, onUpsertMatch: async () => {}, onSubmitResult: async (r) => { submits.push(r); },
      now: () => new Date(), knownResults: known,
    });
    expect(submits.length).toBe(0);
  });
});
```

- [ ] **Step 4: Implement `oracle/src/poller.ts`**

```ts
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
```

- [ ] **Step 5: Implement `oracle/src/index.ts`**

```ts
import { createPublicClient, createWalletClient, http, encodeFunctionData, keccak256, toBytes, padHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MatchRegistryAbi, OracleAbi, arcTestnet, asciiToBytes32 } from "@arc-pick/sdk/core";
import { loadConfig } from "./config.js";
import { createHttpFootballDataClient } from "./footballData.js";
import { runOnce, matchIdOf } from "./poller.js";
import { signResult } from "./signer.js";
import { log } from "./log.js";

const cfg = loadConfig();
const chain = { ...arcTestnet, id: cfg.chainId, rpcUrls: { default: { http: [cfg.rpcUrl] }, public: { http: [cfg.rpcUrl] } } };
const signerAccount = privateKeyToAccount(cfg.signerPrivateKey);
const submitterAccount = privateKeyToAccount(cfg.submitterPrivateKey);
const wallet = createWalletClient({ account: submitterAccount, chain, transport: http(cfg.rpcUrl) });
const fd = createHttpFootballDataClient({ base: cfg.footballDataBase, apiKey: cfg.footballDataApiKey, competition: "WC" });

const knownResults = new Set<string>();

async function tick() {
  await runOnce({
    fd,
    now: () => new Date(),
    knownResults,
    async onUpsertMatch(m) {
      const data = encodeFunctionData({
        abi: MatchRegistryAbi,
        functionName: "upsertMatch",
        args: [m.matchId, asciiToBytes32(m.homeTeam.slice(0, 3).toUpperCase()), asciiToBytes32(m.awayTeam.slice(0, 3).toUpperCase()), m.kickoff],
      });
      try {
        const tx = await wallet.sendTransaction({ to: cfg.registry, data });
        log.info({ matchId: m.matchId, tx }, "upserted match");
      } catch (err: any) {
        log.error({ err: err?.message, matchId: m.matchId }, "upsert failed (may be already-Closed)");
      }
    },
    async onSubmitResult(r) {
      const sig = await signResult({
        account: signerAccount,
        matchId: r.matchId,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        signedAt: r.signedAt,
        chainId: cfg.chainId,
        oracleAddress: cfg.oracle,
      });
      const data = encodeFunctionData({
        abi: OracleAbi,
        functionName: "submitResult",
        args: [r.matchId, r.homeScore, r.awayScore, r.signedAt, sig],
      });
      try {
        const tx = await wallet.sendTransaction({ to: cfg.oracle, data });
        knownResults.add(r.matchId);
        log.info({ matchId: r.matchId, tx, homeScore: r.homeScore, awayScore: r.awayScore }, "result submitted");
      } catch (err: any) {
        log.error({ err: err?.message, matchId: r.matchId }, "submit failed");
      }
    },
  });
}

log.info({ pollSeconds: cfg.pollSeconds }, "oracle starting");
tick().catch((e) => log.error(e, "first tick failed"));
setInterval(() => tick().catch((e) => log.error(e, "tick failed")), cfg.pollSeconds * 1000);
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @arc-pick/oracle test 2>&1 | tail -6
```

Expected: 3 oracle tests pass (1 signer + 2 poller).

- [ ] **Step 7: Commit**

```bash
git add oracle/src/ oracle/test/
git commit -m "feat(oracle): football-data poller + EIP-712 signer + chain submitter"
```

---

## Task 6: Keeper

**Files:**

- Create: `keeper/package.json`, `keeper/tsconfig.json`, `keeper/Dockerfile`, `keeper/src/{log,config,tick,index}.ts`, `keeper/test/tick.test.ts`

- [ ] **Step 1: `keeper/package.json`**

```json
{
  "name": "@arc-pick/keeper",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@arc-pick/sdk": "workspace:*",
    "pino": "^9.4.0",
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "engines": { "node": ">=20.11.0" }
}
```

- [ ] **Step 2: `keeper/tsconfig.json`** (same shape as relay/oracle — paste verbatim)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: `keeper/Dockerfile`**

```dockerfile
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /work
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml /work/
COPY sdk/ /work/sdk/
COPY keeper/ /work/keeper/
COPY compose-init/wait-for-deploy.sh /usr/local/bin/wait-for-deploy
RUN chmod +x /usr/local/bin/wait-for-deploy && pnpm install --frozen-lockfile
RUN pnpm --filter @arc-pick/sdk build && pnpm --filter @arc-pick/keeper build
ENTRYPOINT ["sh", "-c", "wait-for-deploy && node /work/keeper/dist/index.js"]
```

- [ ] **Step 4: `keeper/src/log.ts` + `keeper/src/config.ts`**

```ts
// log.ts
import pino from "pino";
export const log = pino({ level: process.env.LOG_LEVEL ?? "info", formatters: { level: (l) => ({ level: l }) } });
```

```ts
// config.ts
export interface KeeperConfig {
  chainId: number;
  rpcUrl: string;
  registry: `0x${string}`;
  oracle: `0x${string}`;
  betVault: `0x${string}`;
  keeperPrivateKey: `0x${string}`;
  knownMatchIds: `0x${string}`[];
  tickSeconds: number;
}

function required(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
}

export function loadConfig(): KeeperConfig {
  const ids = (process.env.KNOWN_MATCH_IDS ?? "").split(",").filter(Boolean) as `0x${string}`[];
  return {
    chainId: parseInt(required("CHAIN_ID"), 10),
    rpcUrl: required("RPC_URL"),
    registry: required("MATCH_REGISTRY_ADDRESS") as `0x${string}`,
    oracle: required("ORACLE_ADDRESS") as `0x${string}`,
    betVault: required("BET_VAULT_ADDRESS") as `0x${string}`,
    keeperPrivateKey: required("KEEPER_PRIVATE_KEY") as `0x${string}`,
    knownMatchIds: ids,
    tickSeconds: parseInt(process.env.TICK_SECONDS ?? "60", 10),
  };
}
```

- [ ] **Step 5: Test `keeper/test/tick.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { decideActions } from "../src/tick.js";
import { MatchStatus } from "@arc-pick/sdk/core";

describe("decideActions", () => {
  it("returns closeMarket for Open matches past kickoff", () => {
    const actions = decideActions({
      now: 1_800_000_000n,
      knownMatches: [
        { matchId: "0x" + "01".repeat(32) as `0x${string}`, status: MatchStatus.Open, kickoff: 1_800_000_000n - 10n, resultPosted: false },
        { matchId: "0x" + "02".repeat(32) as `0x${string}`, status: MatchStatus.Open, kickoff: 1_800_000_000n + 600n, resultPosted: false },
      ],
    });
    expect(actions.close.length).toBe(1);
    expect(actions.close[0]).toBe("0x" + "01".repeat(32));
    expect(actions.settle.length).toBe(0);
  });

  it("returns settleMarket for Closed matches with result posted", () => {
    const actions = decideActions({
      now: 1_800_000_000n,
      knownMatches: [
        { matchId: "0x" + "01".repeat(32) as `0x${string}`, status: MatchStatus.Closed, kickoff: 1_800_000_000n - 100n, resultPosted: true },
        { matchId: "0x" + "02".repeat(32) as `0x${string}`, status: MatchStatus.Closed, kickoff: 1_800_000_000n - 100n, resultPosted: false },
      ],
    });
    expect(actions.settle.length).toBe(1);
    expect(actions.settle[0]).toBe("0x" + "01".repeat(32));
    expect(actions.close.length).toBe(0);
  });

  it("returns nothing for Settled matches", () => {
    const actions = decideActions({
      now: 1_800_000_000n,
      knownMatches: [
        { matchId: "0x" + "01".repeat(32) as `0x${string}`, status: MatchStatus.Settled, kickoff: 1_800_000_000n - 100n, resultPosted: true },
      ],
    });
    expect(actions.close.length).toBe(0);
    expect(actions.settle.length).toBe(0);
  });
});
```

- [ ] **Step 6: Implement `keeper/src/tick.ts`**

```ts
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
```

- [ ] **Step 7: Implement `keeper/src/index.ts`**

```ts
import { createPublicClient, createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MatchRegistryAbi, BetVaultAbi, OracleAbi, arcTestnet, MatchStatus } from "@arc-pick/sdk/core";
import { loadConfig } from "./config.js";
import { decideActions, type KnownMatch } from "./tick.js";
import { log } from "./log.js";

const cfg = loadConfig();
const chain = { ...arcTestnet, id: cfg.chainId, rpcUrls: { default: { http: [cfg.rpcUrl] }, public: { http: [cfg.rpcUrl] } } };
const account = privateKeyToAccount(cfg.keeperPrivateKey);
const wallet = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });
const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });

async function loadState(): Promise<KnownMatch[]> {
  const out: KnownMatch[] = [];
  for (const matchId of cfg.knownMatchIds) {
    const m = await publicClient.readContract({
      address: cfg.registry, abi: MatchRegistryAbi, functionName: "matches", args: [matchId],
    }) as readonly [string, string, bigint, number, number];
    const r = await publicClient.readContract({
      address: cfg.oracle, abi: OracleAbi, functionName: "results", args: [matchId],
    }) as readonly [number, number, bigint];
    out.push({ matchId, status: m[3] as MatchStatus, kickoff: m[2], resultPosted: r[2] > 0n });
  }
  return out;
}

async function tick() {
  const state = await loadState();
  const now = BigInt(Math.floor(Date.now() / 1000));
  const { close, settle } = decideActions({ now, knownMatches: state });
  for (const matchId of close) {
    try {
      const data = encodeFunctionData({ abi: MatchRegistryAbi, functionName: "closeMarket", args: [matchId] });
      const tx = await wallet.sendTransaction({ to: cfg.registry, data });
      log.info({ matchId, tx }, "closed market");
    } catch (err: any) { log.error({ err: err?.message, matchId }, "close failed"); }
  }
  for (const matchId of settle) {
    try {
      const data = encodeFunctionData({ abi: BetVaultAbi, functionName: "settleMarket", args: [matchId] });
      const tx = await wallet.sendTransaction({ to: cfg.betVault, data });
      log.info({ matchId, tx }, "settled market");
    } catch (err: any) { log.error({ err: err?.message, matchId }, "settle failed"); }
  }
}

log.info({ tickSeconds: cfg.tickSeconds, knownMatchIds: cfg.knownMatchIds.length }, "keeper starting");
tick().catch((e) => log.error(e, "first tick failed"));
setInterval(() => tick().catch((e) => log.error(e, "tick failed")), cfg.tickSeconds * 1000);
```

- [ ] **Step 8: Run tests**

```bash
pnpm install
pnpm --filter @arc-pick/keeper test 2>&1 | tail -6
```

Expected: 3 tests pass.

- [ ] **Step 9: Commit**

```bash
git add keeper/ pnpm-lock.yaml
git commit -m "feat(keeper): close/settle decision logic + tick loop"
```

---

## Task 7: Agent runtime — scaffold + factory

**Files:**

- Create: `agent/package.json`, `agent/tsconfig.json`, `agent/Dockerfile`, `agent/src/{log,config}.ts`, `agent/src/factory.ts`, `agent/test/factory.test.ts`

- [ ] **Step 1: `agent/package.json`**

```json
{
  "name": "@arc-pick/agent",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@arc-pick/sdk": "workspace:*",
    "@anthropic-ai/sdk": "^0.32.0",
    "fastify": "^5.0.0",
    "pino": "^9.4.0",
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "engines": { "node": ">=20.11.0" }
}
```

- [ ] **Step 2: `agent/tsconfig.json`** (same shape — paste verbatim)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: `agent/Dockerfile`**

```dockerfile
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /work
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml /work/
COPY sdk/ /work/sdk/
COPY agent/ /work/agent/
COPY compose-init/wait-for-deploy.sh /usr/local/bin/wait-for-deploy
RUN chmod +x /usr/local/bin/wait-for-deploy && pnpm install --frozen-lockfile
RUN pnpm --filter @arc-pick/sdk build && pnpm --filter @arc-pick/agent build
ENTRYPOINT ["sh", "-c", "wait-for-deploy && node /work/agent/dist/index.js"]
```

- [ ] **Step 4: `agent/src/log.ts` + `agent/src/config.ts`**

```ts
// log.ts
import pino from "pino";
export const log = pino({ level: process.env.LOG_LEVEL ?? "info", formatters: { level: (l) => ({ level: l }) } });
```

```ts
// config.ts
export interface AgentSvcConfig {
  port: number;
  chainId: number;
  rpcUrl: string;
  usdc: `0x${string}`;
  permit2: `0x${string}`;
  matchRegistry: `0x${string}`;
  market: `0x${string}`;
  betVault: `0x${string}`;
  oracle: `0x${string}`;
  betPaymaster: `0x${string}`;
  platformPrivateKey: `0x${string}`;
  modelProviderWallet: `0x${string}`;
  anthropicApiKey?: string;
  modelName: string;
  perCallUsdc: bigint;
  tickSeconds: number;
  knownMatchIds: `0x${string}`[];
  seedBots: { name: string; strategy: "conservative" | "aggressive" | "model-based"; capUsdc: bigint; ownerWallet: `0x${string}`; ownerPrivateKey: `0x${string}` }[];
}

function required(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
}

export function loadConfig(): AgentSvcConfig {
  const ids = (process.env.KNOWN_MATCH_IDS ?? "").split(",").filter(Boolean) as `0x${string}`[];
  const seedBotsRaw = process.env.SEED_BOTS;
  const seedBots = seedBotsRaw ? JSON.parse(seedBotsRaw) : [];
  return {
    port: parseInt(process.env.PORT ?? "7788", 10),
    chainId: parseInt(required("CHAIN_ID"), 10),
    rpcUrl: required("RPC_URL"),
    usdc: required("USDC_ADDRESS") as `0x${string}`,
    permit2: required("PERMIT2_ADDRESS") as `0x${string}`,
    matchRegistry: required("MATCH_REGISTRY_ADDRESS") as `0x${string}`,
    market: required("MARKET_ADDRESS") as `0x${string}`,
    betVault: required("BET_VAULT_ADDRESS") as `0x${string}`,
    oracle: required("ORACLE_ADDRESS") as `0x${string}`,
    betPaymaster: required("BET_PAYMASTER_ADDRESS") as `0x${string}`,
    platformPrivateKey: required("PLATFORM_PRIVATE_KEY") as `0x${string}`,
    modelProviderWallet: required("MODEL_PROVIDER_WALLET") as `0x${string}`,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    modelName: process.env.MODEL_NAME ?? "claude-haiku-4-5-20251001",
    perCallUsdc: BigInt(process.env.PER_CALL_USDC ?? "1000"),
    tickSeconds: parseInt(process.env.TICK_SECONDS ?? "60", 10),
    knownMatchIds: ids,
    seedBots,
  };
}
```

- [ ] **Step 5: Test `agent/test/factory.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { buildRunner } from "../src/factory.js";
import { inMemoryStore } from "@arc-pick/sdk/agent";

describe("buildRunner", () => {
  it("wires a runner with the conservative strategy", () => {
    const placeBet = vi.fn();
    const claimFor = vi.fn();
    const reader = {
      match: vi.fn(), market: vi.fn(), position: vi.fn(),
      listOpen: vi.fn().mockResolvedValue([]),
      isMatchSettled: vi.fn().mockResolvedValue(false),
      hasUserClaimed: vi.fn().mockResolvedValue(false),
    };
    const runner = buildRunner({
      id: "x", ownerWallet: "0x000000000000000000000000000000000000beef" as any,
      strategyName: "conservative", capUsdc: 50_000_000n, expirySeconds: 3600,
      reader: reader as any, placeBet, claimFor, store: inMemoryStore(),
      knownMatchIds: [], tickSeconds: 60,
    });
    expect(runner.status()).toBe("spawning");
  });
});
```

- [ ] **Step 6: Implement `agent/src/factory.ts`**

```ts
import type { Address, Hex } from "viem";
import { AgentRunner, conservative, aggressive, modelBased, inMemoryStore, type Store } from "@arc-pick/sdk/agent";
import { createNanopaymentClient } from "@arc-pick/sdk/server";
import type { OnchainReader } from "@arc-pick/sdk/server";
import Anthropic from "@anthropic-ai/sdk";

export type StrategyName = "conservative" | "aggressive" | "model-based";

export interface BuildRunnerInput {
  id: string;
  ownerWallet: Address;
  strategyName: StrategyName;
  capUsdc: bigint;
  expirySeconds: number;
  reader: OnchainReader;
  placeBet: (input: { matchId: Hex; outcome: 0 | 1 | 2; amount: bigint; ownerWallet: Address }) => Promise<Hex>;
  claimFor: (input: { matchId: Hex; user: Address }) => Promise<Hex>;
  store: Store;
  knownMatchIds: Hex[];
  tickSeconds?: number;
  // model-based wiring (optional unless strategyName === 'model-based')
  anthropicApiKey?: string;
  modelName?: string;
  perCallUsdc?: bigint;
  fallbackTransfer?: (input: { amountUsdc: bigint; memo?: string }) => Promise<Hex>;
}

export function buildRunner(input: BuildRunnerInput): AgentRunner {
  let strategy;
  if (input.strategyName === "conservative") strategy = conservative();
  else if (input.strategyName === "aggressive") strategy = aggressive();
  else if (input.strategyName === "model-based") {
    if (!input.anthropicApiKey) throw new Error("model-based needs anthropicApiKey");
    if (!input.fallbackTransfer) throw new Error("model-based needs fallbackTransfer");
    strategy = modelBased({
      nanopay: createNanopaymentClient({ fallbackTransfer: input.fallbackTransfer }),
      anthropic: new Anthropic({ apiKey: input.anthropicApiKey }),
      model: input.modelName ?? "claude-haiku-4-5-20251001",
      perCallUsdc: input.perCallUsdc ?? 1000n,
    });
  } else {
    throw new Error(`unknown strategy ${input.strategyName}`);
  }
  return new AgentRunner({
    id: input.id,
    ownerWallet: input.ownerWallet,
    strategy,
    capUsdc: input.capUsdc,
    expirySeconds: input.expirySeconds,
    reader: input.reader,
    placeBet: input.placeBet,
    claimFor: input.claimFor,
    store: input.store,
    knownMatchIds: input.knownMatchIds,
    tickSeconds: input.tickSeconds,
  });
}
```

- [ ] **Step 7: Run tests**

```bash
pnpm install
pnpm --filter @arc-pick/agent test 2>&1 | tail -6
```

Expected: 1 test passes.

- [ ] **Step 8: Commit**

```bash
git add agent/ pnpm-lock.yaml
git commit -m "feat(agent): scaffold + factory wiring strategies + Nanopay client"
```

---

## Task 8: Agent control plane

**Files:**

- Create: `agent/src/server.ts`
- Create: `agent/test/server.test.ts`

- [ ] **Step 1: Test `agent/test/server.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { buildAgentServer } from "../src/server.js";

describe("agent control plane", () => {
  it("POST /control/spawn returns 200 with agent id", async () => {
    const spawn = vi.fn().mockResolvedValue({ id: "agent-1" });
    const list = vi.fn().mockResolvedValue([]);
    const pause = vi.fn();
    const app = buildAgentServer({ spawn, list, pause });
    const res = await app.inject({
      method: "POST",
      url: "/control/spawn",
      payload: { ownerWallet: "0x000000000000000000000000000000000000beef", strategy: "conservative", capUsdc: "50000000", expirySeconds: 86400 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe("agent-1");
  });

  it("GET /agents returns the list", async () => {
    const list = vi.fn().mockResolvedValue([{ id: "x", status: "active", capUsdc: "50000000", spentUsdc: "0", strategy: "conservative" }]);
    const app = buildAgentServer({ spawn: vi.fn(), list, pause: vi.fn() });
    const res = await app.inject({ method: "GET", url: "/agents" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).agents.length).toBe(1);
  });

  it("POST /control/pause/:id calls pause", async () => {
    const pause = vi.fn().mockResolvedValue(undefined);
    const app = buildAgentServer({ spawn: vi.fn(), list: vi.fn().mockResolvedValue([]), pause });
    const res = await app.inject({ method: "POST", url: "/control/pause/agent-1" });
    expect(res.statusCode).toBe(200);
    expect(pause).toHaveBeenCalledWith("agent-1");
  });
});
```

- [ ] **Step 2: Implement `agent/src/server.ts`**

```ts
import Fastify, { type FastifyInstance } from "fastify";

export interface SpawnInput {
  ownerWallet: `0x${string}`;
  strategy: "conservative" | "aggressive" | "model-based";
  capUsdc: string;        // string-encoded bigint
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
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @arc-pick/agent test 2>&1 | tail -8
```

Expected: 4 tests pass (1 factory + 3 server).

- [ ] **Step 4: Commit**

```bash
git add agent/src/server.ts agent/test/server.test.ts
git commit -m "feat(agent): Fastify control plane (spawn / pause / list)"
```

---

## Task 9: Agent runtime — seed bots + entry

**Files:**

- Create: `agent/src/seedBots.ts`
- Create: `agent/src/index.ts`

The entry wires:
- viem clients (public + per-bot wallet for the platform)
- An OnchainReader bound to deployed addresses
- A spawn registry (Map<id, AgentRunner>) backed by `inMemoryStore`
- placeBet / claimFor closures using the per-owner wallet (encoded as `placeBetFromAllowance` for agent path — owner needs to have set the Permit2 allowance + authorized the agent runtime key on BetVault beforehand; demo bots receive these via the seed script).

For the demo bots specifically, the seed script handles allowance + authorize before this service starts. In a fresh compose stack, the seed step lands those grants automatically — see Task 11.

- [ ] **Step 1: Implement `agent/src/seedBots.ts`**

```ts
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
        expirySeconds: 30 * 24 * 3600, // 30 days
        label: b.name,
      });
      log.info({ name: b.name, id: r.id, strategy: b.strategy, capUsdc: b.capUsdc.toString() }, "seed bot spawned");
    } catch (err: any) {
      log.error({ err: err?.message, name: b.name }, "seed bot spawn failed");
    }
  }
}
```

- [ ] **Step 2: Implement `agent/src/index.ts`**

```ts
import { createPublicClient, createWalletClient, http, encodeFunctionData, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, BetVaultAbi } from "@arc-pick/sdk/core";
import { createOnchainReader } from "@arc-pick/sdk/server";
import { inMemoryStore } from "@arc-pick/sdk/agent";
import { loadConfig } from "./config.js";
import { buildRunner } from "./factory.js";
import { buildAgentServer, type SpawnInput, type AgentSummary } from "./server.js";
import { spawnSeedBots } from "./seedBots.js";
import { log } from "./log.js";

const cfg = loadConfig();
const chain = { ...arcTestnet, id: cfg.chainId, rpcUrls: { default: { http: [cfg.rpcUrl] }, public: { http: [cfg.rpcUrl] } } };
const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
const platformAccount = privateKeyToAccount(cfg.platformPrivateKey);
const platformWallet = createWalletClient({ account: platformAccount, chain, transport: http(cfg.rpcUrl) });

const reader = createOnchainReader({
  client: publicClient,
  addrs: {
    usdc: cfg.usdc, permit2: cfg.permit2,
    matchRegistry: cfg.matchRegistry, market: cfg.market, betVault: cfg.betVault,
    oracle: cfg.oracle, betPaymaster: cfg.betPaymaster,
  },
});

const store = inMemoryStore();
const runners = new Map<string, ReturnType<typeof buildRunner>>();
const labels = new Map<string, string>();
let counter = 0;

function nextId(label?: string): string {
  counter += 1;
  return label ? `${label}-${counter}` : `agent-${counter}`;
}

async function placeBet(input: { matchId: Hex; outcome: 0 | 1 | 2; amount: bigint; ownerWallet: Address }): Promise<Hex> {
  const data = encodeFunctionData({
    abi: BetVaultAbi,
    functionName: "placeBetFromAllowance",
    args: [input.matchId, input.outcome, input.amount, input.ownerWallet],
  });
  return platformWallet.sendTransaction({ to: cfg.betVault, data });
}

async function claimFor(input: { matchId: Hex; user: Address }): Promise<Hex> {
  const data = encodeFunctionData({ abi: BetVaultAbi, functionName: "claimFor", args: [input.matchId, input.user] });
  return platformWallet.sendTransaction({ to: cfg.betVault, data });
}

async function fallbackTransfer({ amountUsdc }: { amountUsdc: bigint }): Promise<Hex> {
  const usdcAbi = [
    {
      type: "function", name: "transferFrom",
      inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" }],
      outputs: [{ type: "bool" }], stateMutability: "nonpayable",
    },
  ] as const;
  const data = encodeFunctionData({
    abi: usdcAbi, functionName: "transferFrom",
    args: [platformAccount.address, cfg.modelProviderWallet, amountUsdc],
  });
  return platformWallet.sendTransaction({ to: cfg.usdc, data });
}

async function spawn(input: SpawnInput & { label?: string }): Promise<{ id: string }> {
  const id = nextId(input.label);
  const runner = buildRunner({
    id,
    ownerWallet: input.ownerWallet,
    strategyName: input.strategy,
    capUsdc: BigInt(input.capUsdc),
    expirySeconds: input.expirySeconds,
    reader,
    placeBet,
    claimFor,
    store,
    knownMatchIds: cfg.knownMatchIds,
    tickSeconds: cfg.tickSeconds,
    anthropicApiKey: cfg.anthropicApiKey,
    modelName: cfg.modelName,
    perCallUsdc: cfg.perCallUsdc,
    fallbackTransfer,
  });
  await runner.start();
  runners.set(id, runner);
  if (input.label) labels.set(id, input.label);
  return { id };
}

async function pause(id: string): Promise<void> {
  const r = runners.get(id);
  if (!r) throw new Error("not found");
  await r.pause();
}

async function list(): Promise<AgentSummary[]> {
  const records = await store.list();
  return records.map((r) => ({
    id: r.id,
    status: r.status,
    capUsdc: r.capUsdc.toString(),
    spentUsdc: r.spentUsdc.toString(),
    strategy: r.strategyName,
  }));
}

const app = buildAgentServer({ spawn, list, pause });
app.listen({ port: cfg.port, host: "0.0.0.0" }).then(async () => {
  log.info({ port: cfg.port }, "agent service listening");
  if (cfg.seedBots.length > 0) {
    await spawnSeedBots(
      cfg.seedBots.map((b) => ({ ...b, capUsdc: BigInt(b.capUsdc) })),
      { spawn: (input) => spawn(input as any) },
    );
  }
}).catch((err) => {
  log.error({ err: err.message }, "failed to start"); process.exit(1);
});
```

- [ ] **Step 3: Run tests + commit**

```bash
pnpm --filter @arc-pick/agent test 2>&1 | tail -3
git add agent/src/index.ts agent/src/seedBots.ts
git commit -m "feat(agent): runtime entry + seed-bot spawner"
```

(Existing tests should still pass; we don't add new integration tests here since `index.ts` requires a full live stack to exercise meaningfully.)

---

## Task 10: docker-compose service wiring

**Files:**

- Modify: `/Users/long/Code/arc-pick/docker-compose.yml`
- Modify: `/Users/long/Code/arc-pick/.env.example`

- [ ] **Step 1: Extend `.env.example` with service env vars**

Append to `.env.example`:

```
# Services
KEEPER_PRIVATE_KEY=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
PLATFORM_PRIVATE_KEY=0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e
MODEL_PROVIDER_WALLET=0xBcd4042DE499D14e55001CcbB24a551F3b954096
ANTHROPIC_API_KEY=
MODEL_NAME=claude-haiku-4-5-20251001
PER_CALL_USDC=1000
TICK_SECONDS=60
KNOWN_MATCH_IDS=
SEED_BOTS=[]
```

- [ ] **Step 2: Extend `docker-compose.yml` (append four new services)**

```yaml
  relay:
    build:
      context: .
      dockerfile: relay/Dockerfile
    depends_on:
      seed:
        condition: service_completed_successfully
    environment:
      RPC_URL: http://anvil:8545
      CHAIN_ID: "5042002"
      BET_PAYMASTER_ADDRESS: ${BET_PAYMASTER_ADDRESS}
      RELAYER_PRIVATE_KEY: ${RELAYER_PRIVATE_KEY:-0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a}
      PORT: "7787"
    ports: ["7787:7787"]
    volumes: [".:/work"]
    restart: unless-stopped

  oracle:
    build:
      context: .
      dockerfile: oracle/Dockerfile
    depends_on:
      seed:
        condition: service_completed_successfully
    environment:
      RPC_URL: http://anvil:8545
      CHAIN_ID: "5042002"
      MATCH_REGISTRY_ADDRESS: ${MATCH_REGISTRY_ADDRESS}
      ORACLE_ADDRESS: ${ORACLE_ADDRESS}
      ORACLE_SIGNER_PRIVATE_KEY: ${ORACLE_SIGNER_PRIVATE_KEY}
      ORACLE_SUBMITTER_PRIVATE_KEY: ${ORACLE_SUBMITTER_PRIVATE_KEY}
      FOOTBALL_DATA_API_BASE: ${FOOTBALL_DATA_API_BASE:-https://api.football-data.org/v4}
      FOOTBALL_DATA_API_KEY: ${FOOTBALL_DATA_API_KEY:-}
      POLL_INTERVAL_SECONDS: "600"
    volumes: [".:/work"]
    restart: unless-stopped

  keeper:
    build:
      context: .
      dockerfile: keeper/Dockerfile
    depends_on:
      seed:
        condition: service_completed_successfully
    environment:
      RPC_URL: http://anvil:8545
      CHAIN_ID: "5042002"
      MATCH_REGISTRY_ADDRESS: ${MATCH_REGISTRY_ADDRESS}
      ORACLE_ADDRESS: ${ORACLE_ADDRESS}
      BET_VAULT_ADDRESS: ${BET_VAULT_ADDRESS}
      KEEPER_PRIVATE_KEY: ${KEEPER_PRIVATE_KEY}
      KNOWN_MATCH_IDS: ${KNOWN_MATCH_IDS:-}
      TICK_SECONDS: "60"
    volumes: [".:/work"]
    restart: unless-stopped

  agent:
    build:
      context: .
      dockerfile: agent/Dockerfile
    depends_on:
      seed:
        condition: service_completed_successfully
    environment:
      RPC_URL: http://anvil:8545
      CHAIN_ID: "5042002"
      USDC_ADDRESS: ${USDC_ADDRESS}
      PERMIT2_ADDRESS: ${PERMIT2_ADDRESS}
      MATCH_REGISTRY_ADDRESS: ${MATCH_REGISTRY_ADDRESS}
      MARKET_ADDRESS: ${MARKET_ADDRESS}
      BET_VAULT_ADDRESS: ${BET_VAULT_ADDRESS}
      ORACLE_ADDRESS: ${ORACLE_ADDRESS}
      BET_PAYMASTER_ADDRESS: ${BET_PAYMASTER_ADDRESS}
      PLATFORM_PRIVATE_KEY: ${PLATFORM_PRIVATE_KEY}
      MODEL_PROVIDER_WALLET: ${MODEL_PROVIDER_WALLET}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      MODEL_NAME: ${MODEL_NAME:-claude-haiku-4-5-20251001}
      PER_CALL_USDC: ${PER_CALL_USDC:-1000}
      TICK_SECONDS: ${TICK_SECONDS:-60}
      KNOWN_MATCH_IDS: ${KNOWN_MATCH_IDS:-}
      SEED_BOTS: ${SEED_BOTS:-[]}
      PORT: "7788"
    ports: ["7788:7788"]
    volumes: [".:/work"]
    restart: unless-stopped
```

Important: the existing deploy/seed services already export addresses to `deployed.env`. Update the existing `deploy` service to also load `deployed.env` into the compose shell after running — OR simpler, instruct downstream services to source it inline. The cleanest approach for now: services that need addresses receive them via `${...}` expansion which Compose resolves at start. If `deployed.env` is the source of truth, update the compose docs:

In `README.md`, add:

```
After `docker compose up deploy seed`, run:
  set -a; source deployed.env; set +a
then `docker compose up relay oracle keeper agent`.
```

- [ ] **Step 3: Verify compose config syntax**

```bash
cd /Users/long/Code/arc-pick
docker compose config --quiet
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat(compose): wire relay/oracle/keeper/agent services"
```

---

## Task 11: Services CI workflow

**Files:**

- Create: `.github/workflows/services.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: services

on:
  push:
    branches: [main]
  pull_request:

jobs:
  services:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - name: Install
        run: pnpm install --frozen-lockfile
      - name: Build SDK (services depend on it)
        run: pnpm --filter @arc-pick/sdk build
      - name: Typecheck
        run: |
          pnpm --filter @arc-pick/relay typecheck
          pnpm --filter @arc-pick/oracle typecheck
          pnpm --filter @arc-pick/keeper typecheck
          pnpm --filter @arc-pick/agent typecheck
      - name: Build
        run: pnpm build:services
      - name: Test
        run: pnpm test:services
```

- [ ] **Step 2: Commit + push + verify CI**

```bash
git add .github/workflows/services.yml
git commit -m "ci(services): pnpm install + build + test for all four services"
git push origin main
gh run watch --repo longvo2k/arc-pick --exit-status
```

Expected: all CI jobs green (contracts, sdk, services).

---

## Self-Review

**1. Spec coverage:**

- ✅ Oracle (spec §7) — Tasks 4-5: football-data client (HTTP + fake), poller, EIP-712 signer, on-chain submitter.
- ✅ Keeper (spec §8) — Task 6: closeMarket + settleMarket tick loop, pure decideActions for testing.
- ✅ Relay (spec §9) — Tasks 2-3: Fastify forwarder, sliding-window rate limit, EIP-712 sponsor flow forwarded to BetPaymaster.
- ✅ Agent runtime (spec §10) — Tasks 7-9: factory wires strategies, control plane HTTP server, seed-bot spawner, runtime entry.
- ✅ Docker compose wiring (spec §14) — Task 10.
- ✅ CI — Task 11.

**Deferred to other plans:**

- Real Postgres-backed agent store (future work; in-memory store ships here).
- Real Circle Nanopayment SDK wiring (consumer of `createNanopaymentClient` provides; falls back to USDC.transferFrom otherwise).
- Demo bot setup script that grants Permit2 allowance + calls `BetVault.authorizeAgent` on behalf of seed bots — required before `placeBetFromAllowance` can succeed. Will land as `compose-init/seed-agents.sh` in **P4** (frontend) since the same script is needed for the demo onboarding flow.
- Frontend integration with the agent control plane — P4.

**2. Placeholder scan:** None. Every step contains complete code or a complete command.

**3. Type consistency:**

- `SponsorBetPayload` (SDK relay.ts) → consumed by `relay/src/server.ts` and re-encoded into BetPaymaster.sponsorBet args in `relay/src/index.ts`.
- `OnchainReader` (SDK server/onchain.ts) → injected into AgentRunner via `agent/src/factory.ts`.
- `MatchStatus` enum used in `keeper/src/tick.ts` and `agent/src/server.ts` (when listing).
- `AgentSummary` shape in `agent/src/server.ts` matches `inMemoryStore`'s `AgentRecord` projection (status, capUsdc, spentUsdc, strategyName → strategy).

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-06-03-arc-pick-p3-services.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks.

**2. Inline Execution** — execute tasks in this session, faster for the mechanical scaffolding tasks.

Which approach?
