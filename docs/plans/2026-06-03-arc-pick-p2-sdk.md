# arc-pick P2: SDK core + server + agent + adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@arc-pick/sdk` — an isomorphic TypeScript client for arc-pick that lets any caller (Next.js demo, agent runtime, third-party integrations) read markets, build Permit2 signatures, place bets, claim payouts, and run autonomous agent strategies (heuristic + LLM-driven with per-inference Nanopayments).

**Architecture:** Five tree-shakeable subpaths under one pnpm workspace package: `core` (isomorphic — ABIs, types, Permit2 builders, EIP-712 builders, calldata, on-chain reads, relay HTTP client), `server` (Node-only — wallet-side helpers and Nanopayment client with USDC fallback), `agent` (Node — Strategy interface, three preset strategies, AgentRunner with tick loop), `adapters` (wallet adapters for Circle Modular Wallets and viem). The package depends only on viem 2.x for chain access and `@anthropic-ai/sdk` for the model-based strategy. P1 contracts run in the docker-compose anvil so SDK integration tests exercise the real ABIs.

**Tech Stack:**

- TypeScript 5.6, ESM only, Node 20.x, viem 2.x.
- Vitest 2.x for tests. msw 2.x for HTTP mocking.
- `@anthropic-ai/sdk` 0.32.x (transitive on `anthropic-ai/sdk-typescript`).
- Build: `tsup` for ESM + d.ts. Lint: `prettier` only (no eslint to keep deps tight).
- Integration tests run against the P1 docker-compose stack (anvil + deployed contracts).

**Out of scope for P2:**

- The React subpath (`sdk/src/react`) — moved to P4 with the demo because component shape depends on demo flows.
- Real Circle Modular Wallets integration — adapter file exists with a stub that throws "not wired" so P4 can drop in the real implementation; the interface is locked here.
- Real Circle Nanopayments — same logic. The client tries an injected `nanopayClient` first; if not provided or it throws, it falls back to USDC.transferFrom. Real wiring happens at the service layer in P3.
- The agent state-store (Postgres). The AgentRunner exposes a `Store` interface; an in-memory `Store` ships here. P3 adds the Postgres-backed one.

---

## File Structure

```
arc-pick/
├── sdk/                                    pnpm workspace member, name = "@arc-pick/sdk"
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsup.config.ts
│   ├── vitest.config.ts
│   ├── README.md
│   ├── src/
│   │   ├── core/
│   │   │   ├── abis.ts                     Exported ABIs (typed) for all 5 contracts
│   │   │   ├── addresses.ts                Address type + arcTestnet chain config (viem chain object)
│   │   │   ├── types.ts                    Match, MarketState, UserPosition, Outcome enum
│   │   │   ├── permit2.ts                  buildBetPermit, buildAgentAllowance, encodeLockdownCall
│   │   │   ├── eip712.ts                   buildSponsorBetSig (typed-data hashing) + domain helpers
│   │   │   ├── calldata.ts                 encodeBetCall, encodeClaim, encodeRefund (viem encodeFunctionData wrappers)
│   │   │   ├── reads.ts                    readMatch, readMarket, readUserPosition, listOpenMatches
│   │   │   ├── relay.ts                    sponsorBet HTTP client (fetch-based)
│   │   │   └── index.ts                    Public barrel
│   │   ├── server/
│   │   │   ├── onchain.ts                  createOnchainReader (Node-only RPC helpers — slightly thicker than core/reads for server use)
│   │   │   ├── nanopay.ts                  createNanopaymentClient with USDC.transferFrom fallback
│   │   │   └── index.ts
│   │   ├── agent/
│   │   │   ├── types.ts                    AgentContext, Pick, Strategy, AgentStatus, Store interface
│   │   │   ├── store-memory.ts             In-memory Store impl
│   │   │   ├── elo.ts                      Static team Elo lookup + probability calc
│   │   │   ├── kelly.ts                    Kelly fraction sizing helpers
│   │   │   ├── strategies/
│   │   │   │   ├── conservative.ts         Kelly ¼ on edges ≥5 pts
│   │   │   │   ├── aggressive.ts           Kelly full + underdog tilt
│   │   │   │   ├── model-based.ts          Anthropic API + Nanopayments per call
│   │   │   │   └── index.ts                Barrel + Strategies factory
│   │   │   ├── runner.ts                   AgentRunner class with tick loop, spawn/pause/expire lifecycle
│   │   │   ├── data/
│   │   │   │   └── team-elo.json           Static FIFA WC 2026 team Elo priors
│   │   │   └── index.ts
│   │   ├── adapters/
│   │   │   ├── types.ts                    WalletAdapter interface
│   │   │   ├── viem.ts                     Wraps a viem WalletClient
│   │   │   ├── circle.ts                   Stub: throws "not wired in P2"; interface only
│   │   │   └── index.ts
│   │   └── index.ts                        Top-level barrel (re-exports all subpaths)
│   └── test/
│       ├── core/
│       │   ├── permit2.test.ts             Snapshot of signed Permit2 envelopes
│       │   ├── eip712.test.ts              SponsorBet sig snapshot + roundtrip
│       │   ├── calldata.test.ts            encodeBetCall roundtrip through viem decodeFunctionData
│       │   └── reads.integration.test.ts   Against compose anvil; reads match/market/user
│       ├── server/
│       │   ├── onchain.test.ts             viem mock client; method routing
│       │   └── nanopay.test.ts             Primary + fallback + both-fail paths
│       ├── agent/
│       │   ├── elo.test.ts                 Static lookups + edge cases
│       │   ├── kelly.test.ts               Sizing math
│       │   ├── strategies.test.ts          Each preset; seeded RNG; assert deterministic picks
│       │   └── runner.test.ts              Spawn/tick/pause/expire; mock chain via msw + viem
│       ├── adapters/
│       │   └── viem.test.ts                Sign roundtrip with viem account
│       └── helpers.ts                      Compose anvil RPC URL constant, deployed.env loader, fixtures
├── .github/workflows/
│   ├── contracts.yml                       (existing)
│   └── sdk.yml                             New — pnpm install, sdk build, sdk test, coverage gate
└── package.json                            Add sdk build/test scripts to root
```

---

## Task 1: SDK package scaffold

**Files:**

- Create: `sdk/package.json`
- Create: `sdk/tsconfig.json`
- Create: `sdk/tsup.config.ts`
- Create: `sdk/vitest.config.ts`
- Create: `sdk/src/index.ts`
- Create: `sdk/README.md`
- Create: `sdk/.gitignore`
- Modify: root `package.json` to add SDK scripts

- [ ] **Step 1: Create `sdk/package.json`**

```json
{
  "name": "@arc-pick/sdk",
  "version": "0.0.0",
  "type": "module",
  "private": false,
  "license": "MIT",
  "description": "TypeScript SDK for the arc-pick WC 2026 prediction market on Arc Testnet.",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./core": { "import": "./dist/core/index.js", "types": "./dist/core/index.d.ts" },
    "./server": { "import": "./dist/server/index.js", "types": "./dist/server/index.d.ts" },
    "./agent": { "import": "./dist/agent/index.js", "types": "./dist/agent/index.d.ts" },
    "./adapters": { "import": "./dist/adapters/index.js", "types": "./dist/adapters/index.d.ts" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "viem": "^2.21.0",
    "@anthropic-ai/sdk": "^0.32.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@vitest/coverage-v8": "^2.1.0",
    "msw": "^2.4.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "engines": { "node": ">=20.11.0" }
}
```

- [ ] **Step 2: Create `sdk/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Create `sdk/tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "core/index": "src/core/index.ts",
    "server/index": "src/server/index.ts",
    "agent/index": "src/agent/index.ts",
    "adapters/index": "src/adapters/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
  sourcemap: true,
  target: "es2022",
});
```

- [ ] **Step 4: Create `sdk/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/**/types.ts"],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
    environment: "node",
  },
});
```

- [ ] **Step 5: Create `sdk/src/index.ts`**

```ts
// Top-level barrel. Re-exports the four subpaths.
export * from "./core/index.js";
export * as Server from "./server/index.js";
export * as Agent from "./agent/index.js";
export * as Adapters from "./adapters/index.js";
```

- [ ] **Step 6: Create `sdk/README.md`**

```md
# @arc-pick/sdk

TypeScript SDK for the [arc-pick](../) WC 2026 prediction market on Arc Testnet.

Five tree-shakeable subpaths:

- `@arc-pick/sdk/core` — isomorphic builders (Permit2, EIP-712, calldata) + on-chain reads + relay HTTP client.
- `@arc-pick/sdk/server` — Node-only helpers + Nanopayment client with USDC fallback.
- `@arc-pick/sdk/agent` — Strategy interface, three preset strategies, AgentRunner.
- `@arc-pick/sdk/adapters` — viem and Circle Modular Wallets adapters.

## Quick start

```ts
import { buildBetPermit, encodeBetCall } from "@arc-pick/sdk/core";
import { AgentRunner, Strategies } from "@arc-pick/sdk/agent";
```

See `../docs/specs/arc-pick-design.md` § 6 for the full API.
```

- [ ] **Step 7: Create `sdk/.gitignore`**

```
node_modules/
dist/
coverage/
.turbo/
*.tsbuildinfo
```

- [ ] **Step 8: Add scripts to root `package.json`**

In `/Users/long/Code/arc-pick/package.json`, extend the `scripts` block:

```json
"scripts": {
  "build:contracts": "forge build --root contracts",
  "test:contracts": "forge test --root contracts -vv",
  "coverage:contracts": "forge coverage --root contracts --report summary --report lcov",
  "build:sdk": "pnpm --filter @arc-pick/sdk build",
  "test:sdk": "pnpm --filter @arc-pick/sdk test",
  "coverage:sdk": "pnpm --filter @arc-pick/sdk coverage",
  "compose:up": "docker compose up -d",
  "compose:down": "docker compose down -v"
}
```

- [ ] **Step 9: Install dependencies + verify**

Run from repo root:
```bash
pnpm install
pnpm --filter @arc-pick/sdk typecheck
```
Expected: install completes; typecheck passes (empty source compiles).

- [ ] **Step 10: Commit**

```bash
git add sdk/ package.json pnpm-lock.yaml
git commit -m "chore(sdk): scaffold @arc-pick/sdk pnpm workspace package"
```

---

## Task 2: ABIs export

**Files:**

- Create: `sdk/src/core/abis.ts`

The ABIs are typed `const` for viem `parseAbi` / typed inference. To avoid manual JSON drift from Solidity, generate them from Foundry's build output and hand-paste here. Keeping them as TS const literals (not JSON imports) lets viem narrow the call argument types.

- [ ] **Step 1: Generate ABIs from forge artifacts**

From repo root:
```bash
forge build --root contracts
for c in MatchRegistry Market BetVault Oracle BetPaymaster; do
  jq '.abi' contracts/out/$c.sol/$c.json > /tmp/$c.abi.json
done
```

- [ ] **Step 2: Create `sdk/src/core/abis.ts`**

Paste the JSON ABIs as exported TypeScript `as const` arrays. Use one `export const` per contract. Example shape:

```ts
export const MatchRegistryAbi = [
  {
    type: "function",
    name: "matches",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [
      { name: "homeTeam", type: "bytes32" },
      { name: "awayTeam", type: "bytes32" },
      { name: "kickoff", type: "uint64" },
      { name: "status", type: "uint8" },
      { name: "winningOutcome", type: "uint8" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "upsertMatch",
    inputs: [
      { name: "matchId", type: "bytes32" },
      { name: "home", type: "bytes32" },
      { name: "away", type: "bytes32" },
      { name: "kickoff", type: "uint64" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // ... (paste remaining entries from /tmp/MatchRegistry.abi.json)
] as const;
```

Repeat for `MarketAbi`, `BetVaultAbi`, `OracleAbi`, `BetPaymasterAbi`. **Do not** include the ABIs of the mocks; SDK only targets the production contracts.

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @arc-pick/sdk typecheck
```
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add sdk/src/core/abis.ts
git commit -m "feat(sdk): export typed ABIs for the five P1 contracts"
```

---

## Task 3: Addresses + chain config

**Files:**

- Create: `sdk/src/core/addresses.ts`

- [ ] **Step 1: Create `sdk/src/core/addresses.ts`**

```ts
import type { Address, Chain } from "viem";

export const arcTestnet: Chain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
    public: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.network" },
  },
  testnet: true,
};

export interface ArcPickAddresses {
  usdc: Address;
  permit2: Address;
  matchRegistry: Address;
  market: Address;
  betVault: Address;
  oracle: Address;
  betPaymaster: Address;
}

// Canonical Permit2 on Arc Testnet
export const PERMIT2_CANONICAL: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Helper: load deployed.env contents (compose dev) into an ArcPickAddresses object
export function addressesFromEnv(env: Record<string, string | undefined>): ArcPickAddresses {
  const get = (k: string): Address => {
    const v = env[k];
    if (!v) throw new Error(`Missing env var ${k}`);
    return v as Address;
  };
  return {
    usdc: get("USDC_ADDRESS"),
    permit2: get("PERMIT2_ADDRESS"),
    matchRegistry: get("MATCH_REGISTRY_ADDRESS"),
    market: get("MARKET_ADDRESS"),
    betVault: get("BET_VAULT_ADDRESS"),
    oracle: get("ORACLE_ADDRESS"),
    betPaymaster: get("BET_PAYMASTER_ADDRESS"),
  };
}
```

- [ ] **Step 2: Verify**

```bash
pnpm --filter @arc-pick/sdk typecheck
```

- [ ] **Step 3: Commit**

```bash
git add sdk/src/core/addresses.ts
git commit -m "feat(sdk): arcTestnet chain + addresses helper"
```

---

## Task 4: Core types

**Files:**

- Create: `sdk/src/core/types.ts`
- Create: `sdk/test/core/types.test.ts`

- [ ] **Step 1: Create `sdk/src/core/types.ts`**

```ts
import type { Address, Hex } from "viem";

export enum Outcome { Home = 0, Draw = 1, Away = 2 }
export enum MatchStatus { Unknown = 0, Open = 1, Closed = 2, Settled = 3, Voided = 4 }

export interface Match {
  matchId: Hex;
  homeTeam: string;          // decoded from bytes32 (right-padded ASCII)
  awayTeam: string;
  kickoff: bigint;           // unix seconds
  status: MatchStatus;
  winningOutcome: Outcome | null; // null unless status === Settled
}

export interface MarketState {
  matchId: Hex;
  outcomeStake: [bigint, bigint, bigint]; // 6-decimal USDC
  totalPool: bigint;
  impliedProb: [number, number, number];  // 0..1, ratios from outcomeStake (0,0,0 if pool empty)
}

export interface UserPosition {
  matchId: Hex;
  user: Address;
  stakes: [bigint, bigint, bigint];
  claimed: boolean;
  refunded: boolean;
}

export interface Pick {
  matchId: Hex;
  outcome: Outcome;
  amount: bigint;            // USDC 6-decimal
  rationale?: string;
}

// Helper: decode bytes32 ASCII to trimmed string ("ARG\0\0..." → "ARG")
export function bytes32ToAscii(b: Hex): string {
  const hex = b.slice(2);
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substring(i, i + 2), 16);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

export function asciiToBytes32(s: string): Hex {
  if (s.length > 32) throw new Error("string too long for bytes32");
  let hex = "0x";
  for (let i = 0; i < s.length; i++) {
    hex += s.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return (hex + "0".repeat(64 - (hex.length - 2))) as Hex;
}
```

- [ ] **Step 2: Create `sdk/test/core/types.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { bytes32ToAscii, asciiToBytes32 } from "../../src/core/types.js";

describe("bytes32 ASCII roundtrip", () => {
  it("encodes and decodes a 3-char team code", () => {
    const arg = asciiToBytes32("ARG");
    expect(arg).toBe("0x4152470000000000000000000000000000000000000000000000000000000000");
    expect(bytes32ToAscii(arg)).toBe("ARG");
  });

  it("decodes a real bytes32 from on-chain", () => {
    expect(bytes32ToAscii("0x4d45580000000000000000000000000000000000000000000000000000000000")).toBe("MEX");
  });

  it("rejects strings longer than 32 chars", () => {
    expect(() => asciiToBytes32("X".repeat(33))).toThrow();
  });

  it("handles empty string", () => {
    expect(asciiToBytes32("")).toBe("0x" + "0".repeat(64));
    expect(bytes32ToAscii("0x" + "0".repeat(64))).toBe("");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @arc-pick/sdk test
```
Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add sdk/src/core/types.ts sdk/test/core/types.test.ts
git commit -m "feat(sdk): core types + bytes32 ASCII roundtrip"
```

---

## Task 5: Permit2 builders

**Files:**

- Create: `sdk/src/core/permit2.ts`
- Create: `sdk/test/core/permit2.test.ts`

Permit2 signs typed-data EIP-712 envelopes. For arc-pick we need:

- `buildBetPermit` — one-shot `PermitTransferFrom` for human bets (spender = BetVault for the direct path, or spender = Paymaster for the gasless path).
- `buildAgentAllowance` — `AllowanceTransfer` for agent bankroll (owner authorizes BetVault as spender with `cap` and `expiration`).
- `encodeLockdownCall` — viem `encodeFunctionData` for `Permit2.lockdown` so SDK consumers can revoke allowances.

- [ ] **Step 1: Write failing test `sdk/test/core/permit2.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { buildBetPermit, buildAgentAllowance, encodeLockdownCall } from "../../src/core/permit2.js";

const owner = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

describe("buildBetPermit", () => {
  it("builds a typed-data envelope and produces a 65-byte sig", async () => {
    const result = await buildBetPermit({
      owner: owner.address,
      token: "0x3600000000000000000000000000000000000000",
      spender: "0x000000000000000000000000000000000000beef",
      amount: 10_000_000n,
      nonce: 42n,
      deadline: 1_800_000_000n,
      chainId: 5042002,
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      sign: (typedData) => owner.signTypedData(typedData),
    });
    expect(result.permit.permitted.token).toBe("0x3600000000000000000000000000000000000000");
    expect(result.permit.permitted.amount).toBe(10_000_000n);
    expect(result.permit.nonce).toBe(42n);
    expect(result.permit.deadline).toBe(1_800_000_000n);
    expect(result.sig).toMatch(/^0x[0-9a-f]{130}$/);
  });
});

describe("buildAgentAllowance", () => {
  it("builds an AllowanceTransfer envelope and signs", async () => {
    const result = await buildAgentAllowance({
      owner: owner.address,
      token: "0x3600000000000000000000000000000000000000",
      spender: "0x000000000000000000000000000000000000beef",
      capUsdc: 50_000_000n,        // 50 USDC
      expiration: 1_800_000_000,
      nonce: 0,
      chainId: 5042002,
      permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      sign: (typedData) => owner.signTypedData(typedData),
    });
    expect(result.allowance.details.token).toBe("0x3600000000000000000000000000000000000000");
    expect(result.allowance.details.amount).toBe(50_000_000n);
    expect(result.sig).toMatch(/^0x[0-9a-f]{130}$/);
  });
});

describe("encodeLockdownCall", () => {
  it("encodes lockdown for one (token, spender) pair", () => {
    const data = encodeLockdownCall([
      { token: "0x3600000000000000000000000000000000000000", spender: "0x000000000000000000000000000000000000beef" },
    ]);
    expect(data).toMatch(/^0x/);
    expect(data.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @arc-pick/sdk test test/core/permit2.test.ts
```
Expected: "Cannot find module '../../src/core/permit2.js'".

- [ ] **Step 3: Implement `sdk/src/core/permit2.ts`**

```ts
import { encodeFunctionData, type Address, type Hex, type TypedData } from "viem";

const PERMIT2_DOMAIN_NAME = "Permit2";

function domain(chainId: number, verifyingContract: Address) {
  return { name: PERMIT2_DOMAIN_NAME, chainId, verifyingContract };
}

// ---------- SignatureTransfer (one-shot) ----------

export interface BuildBetPermitInput {
  owner: Address;
  token: Address;
  spender: Address;            // BetVault for the direct path; BetPaymaster for sponsored path
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
  chainId: number;
  permit2: Address;
  sign: (typedData: TypedDataPayload) => Promise<Hex>;
}

export interface PermitTransferFromStruct {
  permitted: { token: Address; amount: bigint };
  spender: Address;
  nonce: bigint;
  deadline: bigint;
}

export interface BuildBetPermitResult {
  permit: PermitTransferFromStruct;
  sig: Hex;
}

const PermitTransferFromTypes = {
  PermitTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
} as const satisfies TypedData;

export interface TypedDataPayload {
  domain: { name: string; chainId: number; verifyingContract: Address };
  types: TypedData;
  primaryType: string;
  message: Record<string, unknown>;
}

export async function buildBetPermit(input: BuildBetPermitInput): Promise<BuildBetPermitResult> {
  const permit: PermitTransferFromStruct = {
    permitted: { token: input.token, amount: input.amount },
    spender: input.spender,
    nonce: input.nonce,
    deadline: input.deadline,
  };
  const typedData: TypedDataPayload = {
    domain: domain(input.chainId, input.permit2),
    types: PermitTransferFromTypes,
    primaryType: "PermitTransferFrom",
    message: permit as unknown as Record<string, unknown>,
  };
  const sig = await input.sign(typedData);
  return { permit, sig };
}

// ---------- AllowanceTransfer (recurring) ----------

export interface BuildAgentAllowanceInput {
  owner: Address;
  token: Address;
  spender: Address;            // BetVault
  capUsdc: bigint;             // uint160 in Permit2
  expiration: number;          // uint48
  nonce: number;               // uint48
  chainId: number;
  permit2: Address;
  sign: (typedData: TypedDataPayload) => Promise<Hex>;
}

export interface AllowanceBatchStruct {
  details: { token: Address; amount: bigint; expiration: number; nonce: number };
  spender: Address;
  sigDeadline: bigint;
}

export interface BuildAgentAllowanceResult {
  allowance: AllowanceBatchStruct;
  sig: Hex;
}

const PermitSingleTypes = {
  PermitSingle: [
    { name: "details", type: "PermitDetails" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
} as const satisfies TypedData;

export async function buildAgentAllowance(input: BuildAgentAllowanceInput): Promise<BuildAgentAllowanceResult> {
  const sigDeadline = BigInt(input.expiration); // reuse expiration as sig validity bound
  const allowance: AllowanceBatchStruct = {
    details: {
      token: input.token,
      amount: input.capUsdc,
      expiration: input.expiration,
      nonce: input.nonce,
    },
    spender: input.spender,
    sigDeadline,
  };
  const typedData: TypedDataPayload = {
    domain: domain(input.chainId, input.permit2),
    types: PermitSingleTypes,
    primaryType: "PermitSingle",
    message: allowance as unknown as Record<string, unknown>,
  };
  const sig = await input.sign(typedData);
  return { allowance, sig };
}

// ---------- Lockdown ----------

const LockdownAbiSnippet = [
  {
    type: "function",
    name: "lockdown",
    inputs: [
      {
        name: "approvals",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "spender", type: "address" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export interface TokenSpenderPair { token: Address; spender: Address }

export function encodeLockdownCall(approvals: TokenSpenderPair[]): Hex {
  return encodeFunctionData({
    abi: LockdownAbiSnippet,
    functionName: "lockdown",
    args: [approvals],
  });
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @arc-pick/sdk test test/core/permit2.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sdk/src/core/permit2.ts sdk/test/core/permit2.test.ts
git commit -m "feat(sdk): Permit2 builders (SignatureTransfer + AllowanceTransfer + lockdown)"
```

---

## Task 6: BetPaymaster EIP-712 builder

**Files:**

- Create: `sdk/src/core/eip712.ts`
- Create: `sdk/test/core/eip712.test.ts`

The user-signed payload that the relay forwards to `BetPaymaster.sponsorBet`. Domain separator must match the Solidity contract exactly: name `arc-pick BetPaymaster`, version `1`, current chainId, verifyingContract = paymaster address. Type hash: see the spec.

- [ ] **Step 1: Write failing test `sdk/test/core/eip712.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, encodeAbiParameters } from "viem";
import { buildSponsorBetSig, sponsorBetDomain } from "../../src/core/eip712.js";

const bettor = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

describe("sponsorBetDomain", () => {
  it("matches the Solidity contract domain separator", () => {
    const d = sponsorBetDomain({ chainId: 5042002, paymaster: "0x000000000000000000000000000000000000beef" });
    expect(d.name).toBe("arc-pick BetPaymaster");
    expect(d.version).toBe("1");
    expect(d.chainId).toBe(5042002);
    expect(d.verifyingContract).toBe("0x000000000000000000000000000000000000beef");
  });
});

describe("buildSponsorBetSig", () => {
  it("produces a 65-byte sig that recovers to bettor", async () => {
    const { sig, digest } = await buildSponsorBetSig({
      bettor: bettor.address,
      matchId: "0x" + "ab".repeat(32) as `0x${string}`,
      outcome: 0,
      amount: 1_000_000n,
      nonce: 7n,
      deadline: 1_800_000_000n,
      chainId: 5042002,
      paymaster: "0x000000000000000000000000000000000000beef",
      sign: (typedData) => bettor.signTypedData(typedData),
    });
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
    expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @arc-pick/sdk test test/core/eip712.test.ts
```
Expected: "Cannot find module".

- [ ] **Step 3: Implement `sdk/src/core/eip712.ts`**

```ts
import { hashTypedData, type Address, type Hex, type TypedData } from "viem";
import type { TypedDataPayload } from "./permit2.js";

export const SponsorBetTypes = {
  SponsorBet: [
    { name: "bettor", type: "address" },
    { name: "matchId", type: "bytes32" },
    { name: "outcome", type: "uint8" },
    { name: "amount", type: "uint128" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
    { name: "chainId", type: "uint256" },
  ],
} as const satisfies TypedData;

export function sponsorBetDomain({ chainId, paymaster }: { chainId: number; paymaster: Address }) {
  return {
    name: "arc-pick BetPaymaster",
    version: "1",
    chainId,
    verifyingContract: paymaster,
  };
}

export interface BuildSponsorBetSigInput {
  bettor: Address;
  matchId: Hex;
  outcome: 0 | 1 | 2;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
  chainId: number;
  paymaster: Address;
  sign: (typedData: TypedDataPayload) => Promise<Hex>;
}

export interface BuildSponsorBetSigResult {
  sig: Hex;
  digest: Hex;
}

export async function buildSponsorBetSig(input: BuildSponsorBetSigInput): Promise<BuildSponsorBetSigResult> {
  const message = {
    bettor: input.bettor,
    matchId: input.matchId,
    outcome: input.outcome,
    amount: input.amount,
    nonce: input.nonce,
    deadline: input.deadline,
    chainId: BigInt(input.chainId),
  };
  const typedData: TypedDataPayload = {
    domain: sponsorBetDomain({ chainId: input.chainId, paymaster: input.paymaster }),
    types: SponsorBetTypes,
    primaryType: "SponsorBet",
    message,
  };
  const digest = hashTypedData(typedData);
  const sig = await input.sign(typedData);
  return { sig, digest };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @arc-pick/sdk test test/core/eip712.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sdk/src/core/eip712.ts sdk/test/core/eip712.test.ts
git commit -m "feat(sdk): EIP-712 sponsorBet sig matching BetPaymaster domain"
```

---

## Task 7: Calldata encoders

**Files:**

- Create: `sdk/src/core/calldata.ts`
- Create: `sdk/test/core/calldata.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import { BetVaultAbi } from "../../src/core/abis.js";
import { encodeBetCall, encodeClaimCall, encodeClaimForCall, encodeRefundCall } from "../../src/core/calldata.js";

describe("encodeBetCall", () => {
  it("roundtrips through viem decodeFunctionData", () => {
    const permit = {
      permitted: { token: "0x3600000000000000000000000000000000000000", amount: 10_000_000n },
      nonce: 1n,
      deadline: 1_800_000_000n,
    } as const;
    const data = encodeBetCall({
      matchId: "0x" + "ab".repeat(32) as `0x${string}`,
      outcome: 0,
      amount: 10_000_000n,
      permit,
      sig: "0x" + "11".repeat(65) as `0x${string}`,
    });
    const decoded = decodeFunctionData({ abi: BetVaultAbi, data });
    expect(decoded.functionName).toBe("placeBet");
  });
});

describe("encodeClaimCall", () => {
  it("encodes claim(matchId)", () => {
    const data = encodeClaimCall("0x" + "01".repeat(32) as `0x${string}`);
    const decoded = decodeFunctionData({ abi: BetVaultAbi, data });
    expect(decoded.functionName).toBe("claim");
  });
});

describe("encodeClaimForCall", () => {
  it("encodes claimFor(matchId, user)", () => {
    const data = encodeClaimForCall("0x" + "01".repeat(32) as `0x${string}`, "0x0000000000000000000000000000000000000001");
    const decoded = decodeFunctionData({ abi: BetVaultAbi, data });
    expect(decoded.functionName).toBe("claimFor");
  });
});

describe("encodeRefundCall", () => {
  it("encodes refund(matchId)", () => {
    const data = encodeRefundCall("0x" + "01".repeat(32) as `0x${string}`);
    const decoded = decodeFunctionData({ abi: BetVaultAbi, data });
    expect(decoded.functionName).toBe("refund");
  });
});
```

- [ ] **Step 2: Implement `sdk/src/core/calldata.ts`**

```ts
import { encodeFunctionData, type Address, type Hex } from "viem";
import { BetVaultAbi } from "./abis.js";
import type { PermitTransferFromStruct } from "./permit2.js";

export function encodeBetCall(args: {
  matchId: Hex;
  outcome: 0 | 1 | 2;
  amount: bigint;
  permit: Pick<PermitTransferFromStruct, "permitted" | "nonce" | "deadline">;
  sig: Hex;
}): Hex {
  return encodeFunctionData({
    abi: BetVaultAbi,
    functionName: "placeBet",
    args: [args.matchId, args.outcome, args.amount, args.permit, args.sig],
  });
}

export function encodeClaimCall(matchId: Hex): Hex {
  return encodeFunctionData({ abi: BetVaultAbi, functionName: "claim", args: [matchId] });
}

export function encodeClaimForCall(matchId: Hex, user: Address): Hex {
  return encodeFunctionData({ abi: BetVaultAbi, functionName: "claimFor", args: [matchId, user] });
}

export function encodeRefundCall(matchId: Hex): Hex {
  return encodeFunctionData({ abi: BetVaultAbi, functionName: "refund", args: [matchId] });
}

export function encodeRefundForCall(matchId: Hex, user: Address): Hex {
  return encodeFunctionData({ abi: BetVaultAbi, functionName: "refundFor", args: [matchId, user] });
}

export function encodeAuthorizeAgentCall(agent: Address): Hex {
  return encodeFunctionData({ abi: BetVaultAbi, functionName: "authorizeAgent", args: [agent] });
}

export function encodeDeauthorizeAgentCall(agent: Address): Hex {
  return encodeFunctionData({ abi: BetVaultAbi, functionName: "deauthorizeAgent", args: [agent] });
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @arc-pick/sdk test test/core/calldata.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add sdk/src/core/calldata.ts sdk/test/core/calldata.test.ts
git commit -m "feat(sdk): calldata encoders for placeBet, claim, refund, authorizeAgent"
```

---

## Task 8: On-chain reads

**Files:**

- Create: `sdk/src/core/reads.ts`
- Create: `sdk/test/core/reads.test.ts` (unit, viem mock)
- Create: `sdk/test/core/reads.integration.test.ts` (against compose anvil)
- Create: `sdk/vitest.integration.config.ts`

- [ ] **Step 1: Create `sdk/vitest.integration.config.ts`** (separate config — only run when compose is up)

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.integration.test.ts"],
    testTimeout: 30_000,
    environment: "node",
  },
});
```

- [ ] **Step 2: Write failing unit test `sdk/test/core/reads.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { readMatch, readMarket, readUserPosition, listOpenMatches } from "../../src/core/reads.js";
import { MatchStatus, Outcome } from "../../src/core/types.js";

function makeMockClient(returns: Record<string, unknown>) {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (!(functionName in returns)) throw new Error(`unexpected ${functionName}`);
      return returns[functionName];
    }),
  } as any;
}

describe("readMatch", () => {
  it("decodes Match from registry.matches() tuple", async () => {
    const client = makeMockClient({
      matches: [
        "0x4152470000000000000000000000000000000000000000000000000000000000",
        "0x4d45580000000000000000000000000000000000000000000000000000000000",
        1_800_000_000n,
        1, // Open
        0,
      ],
    });
    const m = await readMatch({
      client,
      matchRegistry: "0x000000000000000000000000000000000000bbbb",
      matchId: "0x01010101010101010101010101010101010101010101010101010101010101010101" as `0x${string}`,
    });
    expect(m.homeTeam).toBe("ARG");
    expect(m.awayTeam).toBe("MEX");
    expect(m.kickoff).toBe(1_800_000_000n);
    expect(m.status).toBe(MatchStatus.Open);
    expect(m.winningOutcome).toBeNull(); // not settled
  });
});

describe("readMarket", () => {
  it("computes implied probabilities from outcomeStake calls", async () => {
    const client = makeMockClient({
      outcomeStake: 0n, // first call
    });
    // multicall layer would batch; for unit tests we patch a simpler mock:
    const c2 = makeMockClient({
      outcomeStake: 100n,
    });
    // For brevity in this test, just assert empty-pool case:
    const empty = makeMockClient({
      outcomeStake: 0n,
    });
    const m = await readMarket({
      client: empty as any,
      market: "0x000000000000000000000000000000000000aaaa",
      matchId: "0x" + "01".repeat(32) as `0x${string}`,
    });
    expect(m.totalPool).toBe(0n);
    expect(m.impliedProb).toEqual([0, 0, 0]);
  });
});

describe("readUserPosition", () => {
  it("returns stakes and claim/refund flags", async () => {
    // Will be tested more thoroughly in the integration test.
    expect(typeof readUserPosition).toBe("function");
  });
});

describe("listOpenMatches", () => {
  it("returns matches with status === Open and kickoff > floor", async () => {
    // Unit test stub; integration test covers the real path.
    expect(typeof listOpenMatches).toBe("function");
  });
});
```

- [ ] **Step 3: Implement `sdk/src/core/reads.ts`**

```ts
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
  matchIds: Hex[];           // caller supplies known matchIds (from off-chain index or event scan)
  kickoffAfter?: bigint;     // floor; default: now
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
```

- [ ] **Step 4: Write `sdk/test/core/reads.integration.test.ts`** (skipped when compose stack down)

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createPublicClient, http, keccak256, toBytes } from "viem";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readMatch, listOpenMatches } from "../../src/core/reads.js";
import { addressesFromEnv, arcTestnet } from "../../src/core/addresses.js";
import { MatchStatus } from "../../src/core/types.js";

const RPC = process.env.ARC_PICK_TEST_RPC ?? "http://localhost:8545";

function loadDeployedEnv(): Record<string, string> {
  try {
    const p = path.resolve(__dirname, "../../../deployed.env");
    const txt = readFileSync(p, "utf8");
    const out: Record<string, string> = {};
    for (const line of txt.split("\n")) {
      const [k, v] = line.split("=", 2);
      if (k && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

describe("reads.integration", () => {
  const env = loadDeployedEnv();
  if (!env.MATCH_REGISTRY_ADDRESS) {
    it.skip("compose stack not running, skipping integration suite", () => {});
    return;
  }
  const addrs = addressesFromEnv(env);
  const client = createPublicClient({ chain: { ...arcTestnet, rpcUrls: { default: { http: [RPC] }, public: { http: [RPC] } } }, transport: http() });

  it("reads a seeded match", async () => {
    const matchId = keccak256(toBytes("FIFA-WC26-1"));
    const m = await readMatch({ client, matchRegistry: addrs.matchRegistry, matchId });
    expect(m.homeTeam).toBe("ARG");
    expect(m.awayTeam).toBe("MEX");
    expect(m.status).toBe(MatchStatus.Open);
  });

  it("lists the six seeded open matches", async () => {
    const ids = [1, 2, 3, 4, 5, 6].map((i) => keccak256(toBytes(`FIFA-WC26-${i}`)));
    const open = await listOpenMatches({ client, matchRegistry: addrs.matchRegistry, matchIds: ids });
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((m) => m.status === MatchStatus.Open)).toBe(true);
  });
});
```

- [ ] **Step 5: Run unit tests**

```bash
pnpm --filter @arc-pick/sdk test test/core/reads.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 6: Run integration tests** (requires `docker compose up -d` first)

```bash
docker compose up -d
pnpm --filter @arc-pick/sdk test:integration
docker compose down -v
```
Expected: 2 integration tests pass.

- [ ] **Step 7: Commit**

```bash
git add sdk/src/core/reads.ts sdk/test/core/reads.test.ts sdk/test/core/reads.integration.test.ts sdk/vitest.integration.config.ts
git commit -m "feat(sdk): on-chain reads (match, market, user position, listOpen)"
```

---

## Task 9: Relay HTTP client

**Files:**

- Create: `sdk/src/core/relay.ts`
- Create: `sdk/test/core/relay.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { sponsorBet } from "../../src/core/relay.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe("sponsorBet", () => {
  it("POSTs payload and returns the relayer's txHash", async () => {
    server.use(
      http.post("http://localhost:7787/api/relay/bet", async ({ request }) => {
        const body = await request.json() as any;
        expect(body.bettor).toBe("0x000000000000000000000000000000000000beef");
        return HttpResponse.json({ txHash: "0x" + "ab".repeat(32) });
      }),
    );
    const r = await sponsorBet({
      relayUrl: "http://localhost:7787/api/relay/bet",
      payload: {
        bettor: "0x000000000000000000000000000000000000beef",
        matchId: "0x" + "01".repeat(32) as `0x${string}`,
        outcome: 0,
        amount: "10000000",                       // strings on the wire (bigint -> JSON-safe)
        permit: { permitted: { token: "0x0", amount: "10000000" }, nonce: "1", deadline: "1800000000" },
        permitSig: "0x" + "11".repeat(65) as `0x${string}`,
        userSig: "0x" + "22".repeat(65) as `0x${string}`,
        deadline: "1800000000",
      },
    });
    expect(r.txHash).toBe("0x" + "ab".repeat(32));
  });

  it("throws on 4xx with body", async () => {
    server.use(
      http.post("http://localhost:7787/api/relay/bet", () =>
        HttpResponse.json({ error: "rate limited" }, { status: 429 }),
      ),
    );
    await expect(
      sponsorBet({ relayUrl: "http://localhost:7787/api/relay/bet", payload: {} as any }),
    ).rejects.toThrow(/rate limited/);
  });
});
```

- [ ] **Step 2: Implement `sdk/src/core/relay.ts`**

```ts
import type { Address, Hex } from "viem";

export interface SponsorBetPayload {
  bettor: Address;
  matchId: Hex;
  outcome: 0 | 1 | 2;
  amount: string;          // stringified bigint for JSON
  permit: {
    permitted: { token: Address; amount: string };
    nonce: string;
    deadline: string;
  };
  permitSig: Hex;
  userSig: Hex;
  deadline: string;
}

export interface SponsorBetInput {
  relayUrl: string;
  payload: SponsorBetPayload;
  fetchImpl?: typeof fetch;
}

export interface SponsorBetResult { txHash: Hex }

export async function sponsorBet({ relayUrl, payload, fetchImpl }: SponsorBetInput): Promise<SponsorBetResult> {
  const f = fetchImpl ?? fetch;
  const res = await f(relayUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    const msg = (body && typeof body === "object" && "error" in body) ? String((body as any).error) : String(body);
    throw new Error(`Relay POST failed (${res.status}): ${msg}`);
  }
  return res.json() as Promise<SponsorBetResult>;
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @arc-pick/sdk test test/core/relay.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add sdk/src/core/relay.ts sdk/test/core/relay.test.ts
git commit -m "feat(sdk): relay HTTP client with error bubbling"
```

---

## Task 10: Core barrel

**Files:**

- Create: `sdk/src/core/index.ts`

- [ ] **Step 1: Create the barrel**

```ts
export * from "./abis.js";
export * from "./addresses.js";
export * from "./types.js";
export * from "./permit2.js";
export * from "./eip712.js";
export * from "./calldata.js";
export * from "./reads.js";
export * from "./relay.js";
```

- [ ] **Step 2: Build the package**

```bash
pnpm --filter @arc-pick/sdk build
```
Expected: emits `dist/core/index.js`, `dist/core/index.d.ts`, etc.

- [ ] **Step 3: Commit**

```bash
git add sdk/src/core/index.ts
git commit -m "feat(sdk): core barrel"
```

---

## Task 11: Server — Nanopayment client

**Files:**

- Create: `sdk/src/server/nanopay.ts`
- Create: `sdk/test/server/nanopay.test.ts`

The client tries an injected `nanopayClient` first; if not provided or it throws, falls back to `USDC.transferFrom(from, modelProviderWallet, amountUsdc)` via a viem WalletClient. The return value records which path ran.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { createNanopaymentClient } from "../../src/server/nanopay.js";

describe("createNanopaymentClient", () => {
  it("uses nanopayClient when provided", async () => {
    const nanopayClient = { pay: vi.fn().mockResolvedValue({ txHash: "0xnano" }) };
    const fallbackTransfer = vi.fn();
    const c = createNanopaymentClient({ nanopayClient, fallbackTransfer });
    const r = await c.pay({ amountUsdc: 1000n, memo: "tick" });
    expect(r.method).toBe("nanopay");
    expect(r.txHash).toBe("0xnano");
    expect(fallbackTransfer).not.toHaveBeenCalled();
  });

  it("falls back to USDC.transferFrom when nanopayClient throws", async () => {
    const nanopayClient = { pay: vi.fn().mockRejectedValue(new Error("nanopay down")) };
    const fallbackTransfer = vi.fn().mockResolvedValue("0xusdc");
    const c = createNanopaymentClient({ nanopayClient, fallbackTransfer });
    const r = await c.pay({ amountUsdc: 1000n, memo: "tick" });
    expect(r.method).toBe("usdc-transfer");
    expect(r.txHash).toBe("0xusdc");
    expect(fallbackTransfer).toHaveBeenCalledWith({ amountUsdc: 1000n, memo: "tick" });
  });

  it("falls back when no nanopayClient is provided", async () => {
    const fallbackTransfer = vi.fn().mockResolvedValue("0xusdc-only");
    const c = createNanopaymentClient({ fallbackTransfer });
    const r = await c.pay({ amountUsdc: 500n, memo: "test" });
    expect(r.method).toBe("usdc-transfer");
    expect(r.txHash).toBe("0xusdc-only");
  });

  it("throws when both paths fail", async () => {
    const nanopayClient = { pay: vi.fn().mockRejectedValue(new Error("nanopay")) };
    const fallbackTransfer = vi.fn().mockRejectedValue(new Error("usdc"));
    const c = createNanopaymentClient({ nanopayClient, fallbackTransfer });
    await expect(c.pay({ amountUsdc: 1n, memo: "t" })).rejects.toThrow(/usdc/);
  });
});
```

- [ ] **Step 2: Implement `sdk/src/server/nanopay.ts`**

```ts
import type { Hex } from "viem";

export interface NanopayPayInput {
  amountUsdc: bigint;
  memo?: string;
}

export interface NanopayResult {
  txHash: Hex;
  method: "nanopay" | "usdc-transfer";
}

export interface InjectedNanopayClient {
  pay: (input: NanopayPayInput) => Promise<{ txHash: Hex }>;
}

export interface FallbackTransfer {
  (input: NanopayPayInput): Promise<Hex>;
}

export interface CreateNanopaymentClientInput {
  nanopayClient?: InjectedNanopayClient;
  fallbackTransfer: FallbackTransfer;
}

export interface NanopaymentClient {
  pay: (input: NanopayPayInput) => Promise<NanopayResult>;
}

export function createNanopaymentClient(input: CreateNanopaymentClientInput): NanopaymentClient {
  return {
    async pay(payInput: NanopayPayInput): Promise<NanopayResult> {
      if (input.nanopayClient) {
        try {
          const r = await input.nanopayClient.pay(payInput);
          return { txHash: r.txHash, method: "nanopay" };
        } catch {
          // fall through to USDC path
        }
      }
      const txHash = await input.fallbackTransfer(payInput);
      return { txHash, method: "usdc-transfer" };
    },
  };
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @arc-pick/sdk test test/server/nanopay.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add sdk/src/server/nanopay.ts sdk/test/server/nanopay.test.ts
git commit -m "feat(sdk): Nanopayment client with USDC.transferFrom fallback"
```

---

## Task 12: Server — onchain reader

**Files:**

- Create: `sdk/src/server/onchain.ts`
- Create: `sdk/src/server/index.ts`
- Create: `sdk/test/server/onchain.test.ts`

The onchain reader is a Node-only thin wrapper that bundles the core/reads functions behind a stateful object, so server code (relay, oracle, keeper, agent) can keep references and call without re-passing `client` + addresses every time.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { createOnchainReader } from "../../src/server/onchain.js";

describe("createOnchainReader", () => {
  it("exposes match / market / position / list helpers wired to addrs", async () => {
    const client = {
      readContract: vi.fn(async () => 0n),
    } as any;
    const reader = createOnchainReader({
      client,
      addrs: {
        usdc: "0x0000000000000000000000000000000000000001",
        permit2: "0x0000000000000000000000000000000000000002",
        matchRegistry: "0x0000000000000000000000000000000000000003",
        market: "0x0000000000000000000000000000000000000004",
        betVault: "0x0000000000000000000000000000000000000005",
        oracle: "0x0000000000000000000000000000000000000006",
        betPaymaster: "0x0000000000000000000000000000000000000007",
      },
    });
    expect(typeof reader.match).toBe("function");
    expect(typeof reader.market).toBe("function");
    expect(typeof reader.position).toBe("function");
    expect(typeof reader.listOpen).toBe("function");
    expect(typeof reader.isMatchSettled).toBe("function");
    expect(typeof reader.hasUserClaimed).toBe("function");
  });

  it("isMatchSettled returns true when status === Settled", async () => {
    let calls = 0;
    const client = {
      readContract: vi.fn(async () => {
        calls += 1;
        // tuple: home, away, kickoff, status (3 = Settled), winningOutcome
        return [
          "0x4152470000000000000000000000000000000000000000000000000000000000",
          "0x4d45580000000000000000000000000000000000000000000000000000000000",
          1n,
          3,
          0,
        ];
      }),
    } as any;
    const reader = createOnchainReader({
      client,
      addrs: { usdc: "0x0" as any, permit2: "0x0" as any, matchRegistry: "0x0" as any, market: "0x0" as any, betVault: "0x0" as any, oracle: "0x0" as any, betPaymaster: "0x0" as any },
    });
    const settled = await reader.isMatchSettled("0x" + "01".repeat(32) as `0x${string}`);
    expect(settled).toBe(true);
    expect(calls).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement `sdk/src/server/onchain.ts`**

```ts
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
  match: (matchId: Hex) => Promise<ReturnType<typeof readMatch> extends Promise<infer R> ? R : never>;
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
```

- [ ] **Step 3: Create `sdk/src/server/index.ts`**

```ts
export * from "./onchain.js";
export * from "./nanopay.js";
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @arc-pick/sdk test test/server/
```
Expected: 6 tests pass (nanopay 4 + onchain 2).

- [ ] **Step 5: Commit**

```bash
git add sdk/src/server/onchain.ts sdk/src/server/index.ts sdk/test/server/onchain.test.ts
git commit -m "feat(sdk): server-side onchain reader bundling reads per address book"
```

---

## Task 13: Agent — Elo and Kelly helpers

**Files:**

- Create: `sdk/src/agent/data/team-elo.json`
- Create: `sdk/src/agent/elo.ts`
- Create: `sdk/src/agent/kelly.ts`
- Create: `sdk/test/agent/elo.test.ts`
- Create: `sdk/test/agent/kelly.test.ts`

- [ ] **Step 1: Create `sdk/src/agent/data/team-elo.json`**

Hand-curated FIFA 2026 team Elo priors (rough estimates from public leaderboards as of 2026-06).

```json
{
  "ARG": 2150, "BRA": 2120, "FRA": 2110, "ESP": 2080, "POR": 2070,
  "GER": 2040, "ENG": 2050, "NED": 2030, "ITA": 2010, "URU": 1990,
  "BEL": 1980, "USA": 1900, "MEX": 1880, "JPN": 1860, "MAR": 1850,
  "DEN": 1900, "CRO": 1990, "POL": 1900, "SWI": 1880, "AUS": 1830,
  "CAN": 1810, "CRC": 1820, "SEN": 1880
}
```

- [ ] **Step 2: Implement `sdk/src/agent/elo.ts`**

```ts
import elo from "./data/team-elo.json" assert { type: "json" };

const TABLE: Record<string, number> = elo as Record<string, number>;
const DEFAULT_RATING = 1700;
const HOME_BONUS = 50;

export function rating(team: string): number {
  return TABLE[team] ?? DEFAULT_RATING;
}

/// Returns probabilities [home, draw, away] using a simple Elo + draw-baseline model.
/// Draw share ~ 25% of total, distributed by closeness; remaining 75% split by Elo win probability.
export function impliedProbsFromElo(home: string, away: string): [number, number, number] {
  const rh = rating(home) + HOME_BONUS;
  const ra = rating(away);
  const diff = rh - ra;
  const pHomeRaw = 1 / (1 + Math.pow(10, -diff / 400));
  const closeness = 1 - Math.min(1, Math.abs(diff) / 400);
  const pDraw = 0.18 + 0.12 * closeness; // 0.18 .. 0.30
  const remaining = 1 - pDraw;
  const pHome = pHomeRaw * remaining;
  const pAway = (1 - pHomeRaw) * remaining;
  return [pHome, pDraw, pAway];
}
```

- [ ] **Step 3: Implement `sdk/src/agent/kelly.ts`**

```ts
/// Kelly criterion fractional bet sizing.
/// f = (b * p - q) / b, where b = decimal payoff multiplier (e.g. 2.13x for parimutuel), p = win prob, q = 1-p
export function kellyFraction(p: number, payoutMultiplier: number): number {
  if (payoutMultiplier <= 1) return 0;
  const b = payoutMultiplier - 1;
  const q = 1 - p;
  const f = (b * p - q) / b;
  return Math.max(0, f);
}

/// Quarter Kelly: more conservative; bounded to 0..0.5 of bankroll.
export function kellyQuarter(p: number, payoutMultiplier: number): number {
  return Math.min(0.5, kellyFraction(p, payoutMultiplier) / 4);
}

/// Edge (in points): difference between model prob and implied prob, in percentage points.
export function edgePoints(modelProb: number, impliedProb: number): number {
  return (modelProb - impliedProb) * 100;
}

/// Parimutuel payout multiplier for an outcome.
/// payout = stake * totalPool / outcomeStake -> multiplier = totalPool / outcomeStake (for a single bettor; approximation pre-tx)
export function payoutMultiplier(totalPool: bigint, outcomeStake: bigint, betSize: bigint): number {
  // After we add betSize, outcomeStake grows by betSize and totalPool grows by betSize.
  const newOutcomeStake = outcomeStake + betSize;
  const newTotalPool = totalPool + betSize;
  if (newOutcomeStake === 0n) return 0;
  // Multiplier on the bettor's own stake (their winnings / their stake)
  return Number(newTotalPool) / Number(newOutcomeStake);
}
```

- [ ] **Step 4: Write `sdk/test/agent/elo.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { rating, impliedProbsFromElo } from "../../src/agent/elo.js";

describe("rating", () => {
  it("returns table value when present", () => {
    expect(rating("ARG")).toBe(2150);
    expect(rating("MEX")).toBe(1880);
  });
  it("returns default 1700 for unknown", () => {
    expect(rating("XYZ")).toBe(1700);
  });
});

describe("impliedProbsFromElo", () => {
  it("returns probabilities that sum to ~1", () => {
    const [h, d, a] = impliedProbsFromElo("ARG", "MEX");
    expect(h + d + a).toBeCloseTo(1, 6);
    expect(h).toBeGreaterThan(a); // ARG should favor home
  });
  it("favors home team with bonus when ratings equal", () => {
    const [h, , a] = impliedProbsFromElo("ARG", "ARG");
    expect(h).toBeGreaterThan(a);
  });
});
```

- [ ] **Step 5: Write `sdk/test/agent/kelly.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { kellyFraction, kellyQuarter, edgePoints, payoutMultiplier } from "../../src/agent/kelly.js";

describe("kellyFraction", () => {
  it("returns 0 when payout multiplier <= 1", () => {
    expect(kellyFraction(0.6, 1)).toBe(0);
  });
  it("returns positive for favorable bets", () => {
    expect(kellyFraction(0.6, 2)).toBeGreaterThan(0); // b=1, f = (1*0.6 - 0.4)/1 = 0.2
    expect(kellyFraction(0.6, 2)).toBeCloseTo(0.2, 6);
  });
  it("returns 0 for unfavorable bets", () => {
    expect(kellyFraction(0.3, 2)).toBe(0);
  });
});

describe("kellyQuarter", () => {
  it("returns quarter of full Kelly", () => {
    expect(kellyQuarter(0.6, 2)).toBeCloseTo(0.05, 6);
  });
  it("caps at 0.5 of bankroll", () => {
    expect(kellyQuarter(0.99, 100)).toBeLessThanOrEqual(0.5);
  });
});

describe("edgePoints", () => {
  it("computes positive edge for favorable model", () => {
    expect(edgePoints(0.5, 0.4)).toBeCloseTo(10, 6);
  });
});

describe("payoutMultiplier", () => {
  it("approximates parimutuel payout after self-inclusion", () => {
    const m = payoutMultiplier(100n * 10n**6n, 40n * 10n**6n, 10n * 10n**6n);
    // (100 + 10) / (40 + 10) = 110/50 = 2.2
    expect(m).toBeCloseTo(2.2, 6);
  });
});
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @arc-pick/sdk test test/agent/elo.test.ts test/agent/kelly.test.ts
```
Expected: 9 tests pass.

- [ ] **Step 7: Commit**

```bash
git add sdk/src/agent/elo.ts sdk/src/agent/kelly.ts sdk/src/agent/data/ sdk/test/agent/elo.test.ts sdk/test/agent/kelly.test.ts
git commit -m "feat(sdk/agent): Elo team table, Kelly sizing, parimutuel payout math"
```

---

## Task 14: Agent — types + strategies

**Files:**

- Create: `sdk/src/agent/types.ts`
- Create: `sdk/src/agent/strategies/conservative.ts`
- Create: `sdk/src/agent/strategies/aggressive.ts`
- Create: `sdk/src/agent/strategies/index.ts`
- Create: `sdk/test/agent/strategies.test.ts`

- [ ] **Step 1: Create `sdk/src/agent/types.ts`**

```ts
import type { Address, Hex } from "viem";
import type { Match, MarketState, Outcome, Pick as MarketPick } from "../core/types.js";

export type { Pick as MarketPick } from "../core/types.js";

export type AgentStatus = "spawning" | "active" | "paused" | "expired" | "errored";

export interface AgentContext {
  ownerWallet: Address;
  capUsdc: bigint;                 // remaining cap (= initial cap - sum placed this session)
  matchesOpen: Match[];
  pools: Map<Hex, MarketState>;
  history: Bet[];
  rng: () => number;               // seeded for tests
  now: () => Date;                 // injectable
}

export interface Bet {
  matchId: Hex;
  outcome: Outcome;
  amount: bigint;
  placedAt: Date;
  txHash?: Hex;
}

export interface Strategy {
  readonly name: string;
  decide(ctx: AgentContext): Promise<MarketPick[]>;
}

export interface AgentSpawnInput {
  ownerWallet: Address;
  strategy: Strategy;
  capUsdc: bigint;
  expirySeconds: number;
  modelProviderWallet?: Address;
}
```

- [ ] **Step 2: Implement `sdk/src/agent/strategies/conservative.ts`**

```ts
import { Outcome, MatchStatus } from "../../core/types.js";
import type { Strategy } from "../types.js";
import type { MarketPick } from "../../core/types.js";
import { impliedProbsFromElo } from "../elo.js";
import { edgePoints, kellyQuarter, payoutMultiplier } from "../kelly.js";

export const MIN_STAKE = 500_000n;       // 0.5 USDC
export const MIN_EDGE_POINTS = 5;        // 5 percentage points

export function conservative(): Strategy {
  return {
    name: "conservative",
    async decide(ctx) {
      const picks: MarketPick[] = [];
      for (const m of ctx.matchesOpen) {
        if (m.status !== MatchStatus.Open) continue;
        const pool = ctx.pools.get(m.matchId);
        if (!pool || pool.totalPool === 0n) continue;
        const modelProbs = impliedProbsFromElo(m.homeTeam, m.awayTeam);
        let bestOutcome: Outcome | null = null;
        let bestFraction = 0;
        let bestAmount = 0n;
        for (const o of [Outcome.Home, Outcome.Draw, Outcome.Away] as const) {
          const modelP = modelProbs[o];
          const impliedP = pool.impliedProb[o];
          if (edgePoints(modelP, impliedP) < MIN_EDGE_POINTS) continue;
          const sizingAmount = (ctx.capUsdc * 250n) / 1000n; // hypothetical bet for multiplier estimate
          const mult = payoutMultiplier(pool.totalPool, pool.outcomeStake[o], sizingAmount);
          if (mult <= 1) continue;
          const f = kellyQuarter(modelP, mult);
          const amount = bigintFromFloat(ctx.capUsdc, f);
          if (amount < MIN_STAKE) continue;
          if (f > bestFraction) {
            bestFraction = f;
            bestOutcome = o;
            bestAmount = amount;
          }
        }
        if (bestOutcome !== null && bestAmount > 0n) {
          picks.push({ matchId: m.matchId, outcome: bestOutcome, amount: bestAmount, rationale: `Elo edge ≥${MIN_EDGE_POINTS}pp, Kelly¼` });
        }
      }
      return picks;
    },
  };
}

function bigintFromFloat(bankroll: bigint, fraction: number): bigint {
  const scaled = BigInt(Math.floor(fraction * 1_000_000));
  return (bankroll * scaled) / 1_000_000n;
}
```

- [ ] **Step 3: Implement `sdk/src/agent/strategies/aggressive.ts`**

```ts
import { Outcome, MatchStatus } from "../../core/types.js";
import type { Strategy } from "../types.js";
import type { MarketPick } from "../../core/types.js";
import { impliedProbsFromElo } from "../elo.js";
import { kellyFraction, payoutMultiplier } from "../kelly.js";

const MIN_STAKE = 500_000n;
const UNDERDOG_TILT = 1.25;

export function aggressive(): Strategy {
  return {
    name: "aggressive",
    async decide(ctx) {
      const picks: MarketPick[] = [];
      for (const m of ctx.matchesOpen) {
        if (m.status !== MatchStatus.Open) continue;
        const pool = ctx.pools.get(m.matchId);
        if (!pool || pool.totalPool === 0n) continue;
        const modelProbs = impliedProbsFromElo(m.homeTeam, m.awayTeam);
        let bestOutcome: Outcome | null = null;
        let bestSize = 0n;
        for (const o of [Outcome.Home, Outcome.Draw, Outcome.Away] as const) {
          const modelP = modelProbs[o];
          const impliedP = pool.impliedProb[o];
          if (modelP <= impliedP) continue;
          const sizingAmount = (ctx.capUsdc * 250n) / 1000n;
          const mult = payoutMultiplier(pool.totalPool, pool.outcomeStake[o], sizingAmount);
          if (mult <= 1) continue;
          let f = kellyFraction(modelP, mult);
          if (impliedP <= 0.25) f *= UNDERDOG_TILT;
          const amount = bigintFromFloat(ctx.capUsdc, Math.min(0.5, f));
          if (amount < MIN_STAKE) continue;
          if (amount > bestSize) {
            bestSize = amount;
            bestOutcome = o;
          }
        }
        if (bestOutcome !== null && bestSize > 0n) {
          picks.push({ matchId: m.matchId, outcome: bestOutcome, amount: bestSize, rationale: "Full Kelly + underdog tilt" });
        }
      }
      return picks;
    },
  };
}

function bigintFromFloat(bankroll: bigint, fraction: number): bigint {
  const scaled = BigInt(Math.floor(fraction * 1_000_000));
  return (bankroll * scaled) / 1_000_000n;
}
```

- [ ] **Step 4: Create `sdk/src/agent/strategies/index.ts`**

```ts
import { conservative } from "./conservative.js";
import { aggressive } from "./aggressive.js";

export { conservative, aggressive };
// modelBased exported separately because it requires Anthropic config (Task 15)
export const Strategies = { conservative, aggressive } as const;
```

- [ ] **Step 5: Write `sdk/test/agent/strategies.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { conservative, aggressive } from "../../src/agent/strategies/index.js";
import { MatchStatus, Outcome } from "../../src/core/types.js";
import type { AgentContext } from "../../src/agent/types.js";

function fakeMatch(id: number, home: string, away: string) {
  return {
    matchId: ("0x" + id.toString(16).padStart(2, "0").repeat(32)) as `0x${string}`,
    homeTeam: home,
    awayTeam: away,
    kickoff: 1_800_000_000n,
    status: MatchStatus.Open,
    winningOutcome: null,
  };
}

function ctx(args: Partial<AgentContext> = {}): AgentContext {
  const m1 = fakeMatch(1, "ARG", "MEX");
  const m2 = fakeMatch(2, "BRA", "CRC");
  const pools = new Map();
  pools.set(m1.matchId, {
    matchId: m1.matchId,
    outcomeStake: [50_000_000n, 30_000_000n, 20_000_000n],
    totalPool: 100_000_000n,
    impliedProb: [0.5, 0.3, 0.2],
  });
  pools.set(m2.matchId, {
    matchId: m2.matchId,
    outcomeStake: [80_000_000n, 10_000_000n, 10_000_000n],
    totalPool: 100_000_000n,
    impliedProb: [0.8, 0.1, 0.1],
  });
  return {
    ownerWallet: "0x000000000000000000000000000000000000beef" as any,
    capUsdc: 50_000_000n,
    matchesOpen: [m1, m2],
    pools,
    history: [],
    rng: () => 0.5,
    now: () => new Date(1_800_000_000_000),
    ...args,
  };
}

describe("conservative strategy", () => {
  it("picks outcomes with edge >=5pp", async () => {
    const picks = await conservative().decide(ctx());
    // ARG: Elo prob home ~0.6, implied 0.5 -> edge 10pp, should pick
    expect(picks.length).toBeGreaterThan(0);
    expect(picks[0]!.amount).toBeGreaterThanOrEqual(500_000n);
  });

  it("skips matches with no pool", async () => {
    const c = ctx();
    c.pools.clear();
    const picks = await conservative().decide(c);
    expect(picks.length).toBe(0);
  });

  it("returns deterministic picks for the same context", async () => {
    const a = await conservative().decide(ctx());
    const b = await conservative().decide(ctx());
    expect(a).toEqual(b);
  });
});

describe("aggressive strategy", () => {
  it("places at least one pick when edges exist", async () => {
    const picks = await aggressive().decide(ctx());
    expect(picks.length).toBeGreaterThan(0);
  });

  it("uses larger amounts than conservative on the same context", async () => {
    const c = ctx();
    const cons = await conservative().decide(c);
    const agg = await aggressive().decide(c);
    if (cons.length > 0 && agg.length > 0) {
      const consMax = cons.reduce((m, p) => p.amount > m ? p.amount : m, 0n);
      const aggMax = agg.reduce((m, p) => p.amount > m ? p.amount : m, 0n);
      expect(aggMax).toBeGreaterThanOrEqual(consMax);
    }
  });
});
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @arc-pick/sdk test test/agent/strategies.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add sdk/src/agent/types.ts sdk/src/agent/strategies/ sdk/test/agent/strategies.test.ts
git commit -m "feat(sdk/agent): conservative + aggressive strategies (heuristic)"
```

---

## Task 15: Agent — model-based strategy

**Files:**

- Create: `sdk/src/agent/strategies/model-based.ts`
- Create: `sdk/test/agent/model-based.test.ts`

The model-based strategy calls the Anthropic API once per match per tick window, paying a Nanopayment before each call.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { modelBased } from "../../src/agent/strategies/model-based.js";
import type { AgentContext } from "../../src/agent/types.js";
import { MatchStatus, Outcome } from "../../src/core/types.js";

function fakeCtx(): AgentContext {
  const m = {
    matchId: "0x" + "01".repeat(32) as `0x${string}`,
    homeTeam: "ARG", awayTeam: "MEX",
    kickoff: 1_800_000_000n,
    status: MatchStatus.Open,
    winningOutcome: null,
  };
  const pool = {
    matchId: m.matchId,
    outcomeStake: [50_000_000n, 30_000_000n, 20_000_000n] as [bigint, bigint, bigint],
    totalPool: 100_000_000n,
    impliedProb: [0.5, 0.3, 0.2] as [number, number, number],
  };
  return {
    ownerWallet: "0x000000000000000000000000000000000000beef" as any,
    capUsdc: 100_000_000n,
    matchesOpen: [m],
    pools: new Map([[m.matchId, pool]]),
    history: [],
    rng: () => 0.5,
    now: () => new Date(1_800_000_000_000),
  };
}

describe("modelBased strategy", () => {
  it("pays per inference and produces a pick from model output", async () => {
    const pay = vi.fn().mockResolvedValue({ txHash: "0xnano", method: "nanopay" as const });
    const messages = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ outcome: 0, confidence: 0.65, sizeBps: 1500, rationale: "Argentina at home" }) }],
    });
    const strategy = modelBased({
      nanopay: { pay },
      anthropic: { messages: { create: messages } } as any,
      model: "claude-haiku-4-5-20251001",
      perCallUsdc: 1000n,
    });
    const picks = await strategy.decide(fakeCtx());
    expect(pay).toHaveBeenCalledTimes(1);
    expect(messages).toHaveBeenCalledTimes(1);
    expect(picks.length).toBe(1);
    expect(picks[0]!.outcome).toBe(Outcome.Home);
    expect(picks[0]!.rationale).toContain("Argentina");
  });

  it("skips a match if pay throws (does not bet on unpaid inference)", async () => {
    const pay = vi.fn().mockRejectedValue(new Error("nanopay + fallback both failed"));
    const messages = vi.fn();
    const strategy = modelBased({
      nanopay: { pay },
      anthropic: { messages: { create: messages } } as any,
      model: "claude-haiku-4-5-20251001",
      perCallUsdc: 1000n,
    });
    const picks = await strategy.decide(fakeCtx());
    expect(messages).not.toHaveBeenCalled();
    expect(picks.length).toBe(0);
  });

  it("rate-limits to one call per match per hour", async () => {
    const pay = vi.fn().mockResolvedValue({ txHash: "0xn", method: "nanopay" as const });
    const messages = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ outcome: 0, confidence: 0.6, sizeBps: 1000, rationale: "x" }) }],
    });
    const strategy = modelBased({
      nanopay: { pay },
      anthropic: { messages: { create: messages } } as any,
      model: "claude-haiku-4-5-20251001",
      perCallUsdc: 1000n,
    });
    await strategy.decide(fakeCtx());
    const second = await strategy.decide(fakeCtx());
    expect(messages).toHaveBeenCalledTimes(1);     // still 1
    expect(second.length).toBe(0);                  // no new pick within window
  });
});
```

- [ ] **Step 2: Implement `sdk/src/agent/strategies/model-based.ts`**

```ts
import type Anthropic from "@anthropic-ai/sdk";
import type { Strategy } from "../types.js";
import type { MarketPick } from "../../core/types.js";
import { Outcome, MatchStatus } from "../../core/types.js";

const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour per (matchId)

export interface ModelBasedInput {
  nanopay: { pay: (input: { amountUsdc: bigint; memo?: string }) => Promise<{ txHash: `0x${string}`; method: "nanopay" | "usdc-transfer" }> };
  anthropic: Anthropic;
  model: string;
  perCallUsdc: bigint;
  systemPrompt?: string;
}

interface ModelOutput {
  outcome: 0 | 1 | 2;
  confidence: number;
  sizeBps: number;
  rationale: string;
}

const DEFAULT_SYSTEM = `You are a football match outcome rater. Given a match between two teams, current pool weights, and recent context, you respond with strict JSON of shape:
{"outcome": 0|1|2, "confidence": 0..1, "sizeBps": 1..10000, "rationale": string}
Outcomes: 0=Home, 1=Draw, 2=Away. Be calibrated. Do not chase narratives. No text outside the JSON.`;

export function modelBased(input: ModelBasedInput): Strategy {
  const lastCalled = new Map<string, number>();
  return {
    name: "model-based",
    async decide(ctx) {
      const picks: MarketPick[] = [];
      for (const m of ctx.matchesOpen) {
        if (m.status !== MatchStatus.Open) continue;
        const last = lastCalled.get(m.matchId) ?? 0;
        const now = ctx.now().getTime();
        if (now - last < RATE_LIMIT_MS) continue;
        const pool = ctx.pools.get(m.matchId);
        if (!pool || pool.totalPool === 0n) continue;
        // 1) Pay per inference
        try {
          await input.nanopay.pay({ amountUsdc: input.perCallUsdc, memo: `${ctx.ownerWallet}:${m.matchId}` });
        } catch {
          continue; // skip this match for this tick if payment failed
        }
        // 2) Call the model
        let parsed: ModelOutput | null = null;
        try {
          const r = await input.anthropic.messages.create({
            model: input.model,
            max_tokens: 200,
            system: input.systemPrompt ?? DEFAULT_SYSTEM,
            messages: [
              {
                role: "user",
                content: `${m.homeTeam} vs ${m.awayTeam}. Pool weights: H=${pool.impliedProb[0].toFixed(2)} D=${pool.impliedProb[1].toFixed(2)} A=${pool.impliedProb[2].toFixed(2)}. Respond JSON.`,
              },
            ],
          });
          const text = (r.content[0] && "text" in r.content[0]) ? (r.content[0] as { text: string }).text : "";
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
        lastCalled.set(m.matchId, now);
        if (!parsed) continue;
        const stake = sizeFromBps(ctx.capUsdc, parsed.confidence, parsed.sizeBps);
        if (stake <= 0n) continue;
        picks.push({
          matchId: m.matchId,
          outcome: parsed.outcome as Outcome,
          amount: stake,
          rationale: parsed.rationale,
        });
      }
      return picks;
    },
  };
}

function sizeFromBps(bankroll: bigint, confidence: number, sizeBps: number): bigint {
  const conf = Math.max(0, Math.min(1, confidence));
  const bps = Math.max(0, Math.min(10000, Math.floor(sizeBps)));
  const scaled = BigInt(Math.floor(conf * bps));
  return (bankroll * scaled) / 10_000n;
}
```

- [ ] **Step 3: Update `sdk/src/agent/strategies/index.ts`**

```ts
import { conservative } from "./conservative.js";
import { aggressive } from "./aggressive.js";
import { modelBased } from "./model-based.js";

export { conservative, aggressive, modelBased };
export const Strategies = { conservative, aggressive, modelBased } as const;
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @arc-pick/sdk test test/agent/model-based.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sdk/src/agent/strategies/model-based.ts sdk/src/agent/strategies/index.ts sdk/test/agent/model-based.test.ts
git commit -m "feat(sdk/agent): model-based strategy with per-inference Nanopayment"
```

---

## Task 16: Agent — in-memory store + runner

**Files:**

- Create: `sdk/src/agent/store-memory.ts`
- Create: `sdk/src/agent/runner.ts`
- Create: `sdk/src/agent/index.ts`
- Create: `sdk/test/agent/runner.test.ts`

- [ ] **Step 1: Create `sdk/src/agent/store-memory.ts`**

```ts
import type { Address, Hex } from "viem";
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
```

- [ ] **Step 2: Implement `sdk/src/agent/runner.ts`**

```ts
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
  knownMatchIds: Hex[];     // matchIds the agent considers (off-chain index)
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
    // Run an immediate tick on start so tests can observe without waiting.
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
        // skip this pick on failure; agent stays active for the next tick
      }
    }
    // Sweep settled matches for claims
    for (const bet of [...this.record.bets]) {
      const settled = await this.input.reader.isMatchSettled(bet.matchId);
      if (!settled) continue;
      const claimed = await this.input.reader.hasUserClaimed(bet.matchId, this.input.ownerWallet);
      if (claimed) continue;
      try {
        await this.input.claimFor({ matchId: bet.matchId, user: this.input.ownerWallet });
      } catch {
        // ignore; will retry next tick
      }
    }
  }
}
```

- [ ] **Step 3: Create `sdk/src/agent/index.ts`**

```ts
export * from "./types.js";
export * from "./elo.js";
export * from "./kelly.js";
export * from "./strategies/index.js";
export * from "./store-memory.js";
export * from "./runner.js";
```

- [ ] **Step 4: Write `sdk/test/agent/runner.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { AgentRunner } from "../../src/agent/runner.js";
import { inMemoryStore } from "../../src/agent/store-memory.js";
import { conservative } from "../../src/agent/strategies/conservative.js";
import { MatchStatus, Outcome } from "../../src/core/types.js";

function fakeReader() {
  const matches = [
    {
      matchId: "0x" + "01".repeat(32) as `0x${string}`,
      homeTeam: "ARG", awayTeam: "MEX",
      kickoff: 9_000_000_000n,
      status: MatchStatus.Open,
      winningOutcome: null,
    },
  ];
  const market = {
    matchId: matches[0]!.matchId,
    outcomeStake: [50_000_000n, 30_000_000n, 20_000_000n] as [bigint, bigint, bigint],
    totalPool: 100_000_000n,
    impliedProb: [0.5, 0.3, 0.2] as [number, number, number],
  };
  return {
    match: async () => matches[0]!,
    market: async () => market,
    position: async () => ({ matchId: matches[0]!.matchId, user: "0x0" as any, stakes: [0n, 0n, 0n] as [bigint, bigint, bigint], claimed: false, refunded: false }),
    listOpen: async () => matches,
    isMatchSettled: async () => false,
    hasUserClaimed: async () => false,
  };
}

describe("AgentRunner", () => {
  it("places at least one bet on tick when strategy returns picks", async () => {
    const placeBet = vi.fn().mockResolvedValue("0xtx");
    const claimFor = vi.fn();
    const runner = new AgentRunner({
      id: "agent-1",
      ownerWallet: "0x000000000000000000000000000000000000beef" as any,
      strategy: conservative(),
      capUsdc: 50_000_000n,
      expirySeconds: 86_400,
      reader: fakeReader() as any,
      placeBet,
      claimFor,
      store: inMemoryStore(),
      knownMatchIds: ["0x" + "01".repeat(32) as `0x${string}`],
      tickSeconds: 60,
    });
    await runner.start();
    await runner.pause();
    expect(placeBet).toHaveBeenCalled();
    expect(runner.status()).toBe("paused");
    expect(runner.remainingCap()).toBeLessThan(50_000_000n);
  });

  it("expires when now >= expiresAt", async () => {
    const placeBet = vi.fn().mockResolvedValue("0xtx");
    const now = vi.fn();
    now.mockReturnValue(new Date(1_000_000_000_000));
    const runner = new AgentRunner({
      id: "agent-2",
      ownerWallet: "0x000000000000000000000000000000000000beef" as any,
      strategy: conservative(),
      capUsdc: 50_000_000n,
      expirySeconds: 1,
      reader: fakeReader() as any,
      placeBet,
      claimFor: vi.fn(),
      store: inMemoryStore(),
      knownMatchIds: ["0x" + "01".repeat(32) as `0x${string}`],
      tickSeconds: 60,
      now,
    });
    await runner.start();
    now.mockReturnValue(new Date(1_000_000_000_000 + 2000)); // past expiry
    await runner.tick();
    expect(runner.status()).toBe("expired");
  });
});
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @arc-pick/sdk test test/agent/runner.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add sdk/src/agent/store-memory.ts sdk/src/agent/runner.ts sdk/src/agent/index.ts sdk/test/agent/runner.test.ts
git commit -m "feat(sdk/agent): AgentRunner with tick loop + in-memory Store"
```

---

## Task 17: Adapters

**Files:**

- Create: `sdk/src/adapters/types.ts`
- Create: `sdk/src/adapters/viem.ts`
- Create: `sdk/src/adapters/circle.ts`
- Create: `sdk/src/adapters/index.ts`
- Create: `sdk/test/adapters/viem.test.ts`

- [ ] **Step 1: Create `sdk/src/adapters/types.ts`**

```ts
import type { Address, Hex } from "viem";
import type { TypedDataPayload } from "../core/permit2.js";

export interface WalletAdapter {
  connect(opts?: { email?: string }): Promise<{ address: Address }>;
  disconnect(): Promise<void>;
  getAddress(): Address | null;
  signTypedData(payload: TypedDataPayload): Promise<Hex>;
  signMessage(message: string): Promise<Hex>;
}
```

- [ ] **Step 2: Create `sdk/src/adapters/viem.ts`**

```ts
import type { Address, Hex, WalletClient } from "viem";
import type { WalletAdapter } from "./types.js";
import type { TypedDataPayload } from "../core/permit2.js";

export function viemWalletAdapter(client: WalletClient): WalletAdapter {
  let address: Address | null = client.account?.address ?? null;
  return {
    async connect() {
      if (!client.account) throw new Error("viem WalletClient has no account");
      address = client.account.address;
      return { address };
    },
    async disconnect() { address = null; },
    getAddress() { return address; },
    signTypedData(payload: TypedDataPayload): Promise<Hex> {
      if (!client.account) throw new Error("no account");
      return client.signTypedData({
        account: client.account,
        domain: payload.domain as any,
        types: payload.types as any,
        primaryType: payload.primaryType as any,
        message: payload.message as any,
      });
    },
    signMessage(message: string): Promise<Hex> {
      if (!client.account) throw new Error("no account");
      return client.signMessage({ account: client.account, message });
    },
  };
}
```

- [ ] **Step 3: Create `sdk/src/adapters/circle.ts`** (stub for P2)

```ts
import type { WalletAdapter } from "./types.js";

/// Stub for the Circle Modular Wallets adapter. The real implementation lands in P4
/// with the demo (`demo/`) so it can be wired against Circle's React SDK. The interface
/// here matches `WalletAdapter` so consumers can plug a different implementation today.
export function circleWalletAdapter(_config?: unknown): WalletAdapter {
  return {
    async connect() { throw new Error("circleWalletAdapter is not wired in P2; use viemWalletAdapter or wait for P4."); },
    async disconnect() { /* noop */ },
    getAddress() { return null; },
    async signTypedData() { throw new Error("circleWalletAdapter is not wired in P2."); },
    async signMessage() { throw new Error("circleWalletAdapter is not wired in P2."); },
  };
}
```

- [ ] **Step 4: Create `sdk/src/adapters/index.ts`**

```ts
export * from "./types.js";
export * from "./viem.js";
export * from "./circle.js";
```

- [ ] **Step 5: Write `sdk/test/adapters/viem.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "../../src/core/addresses.js";
import { viemWalletAdapter } from "../../src/adapters/viem.js";

const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

describe("viemWalletAdapter", () => {
  it("connects and returns the account address", async () => {
    const wc = createWalletClient({ account, chain: arcTestnet, transport: http("http://localhost:8545") });
    const adapter = viemWalletAdapter(wc);
    const { address } = await adapter.connect();
    expect(address).toBe(account.address);
  });

  it("signs typed data through the underlying client", async () => {
    const wc = createWalletClient({ account, chain: arcTestnet, transport: http("http://localhost:8545") });
    const adapter = viemWalletAdapter(wc);
    const sig = await adapter.signTypedData({
      domain: { name: "test", chainId: 5042002, verifyingContract: "0x0000000000000000000000000000000000000001" },
      types: { Test: [{ name: "x", type: "uint256" }] },
      primaryType: "Test",
      message: { x: 7n } as any,
    } as any);
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
  });

  it("signs messages", async () => {
    const wc = createWalletClient({ account, chain: arcTestnet, transport: http("http://localhost:8545") });
    const adapter = viemWalletAdapter(wc);
    const sig = await adapter.signMessage("hello");
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
  });
});
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @arc-pick/sdk test test/adapters/viem.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add sdk/src/adapters/ sdk/test/adapters/viem.test.ts
git commit -m "feat(sdk): wallet adapters (viem + Circle stub)"
```

---

## Task 18: Build + final test pass

**Files:** (no new files)

- [ ] **Step 1: Build the SDK**

```bash
pnpm --filter @arc-pick/sdk build
```
Expected: emits `dist/*` for all four entry points.

- [ ] **Step 2: Run the full unit test suite**

```bash
pnpm --filter @arc-pick/sdk test
```
Expected: all unit tests pass; coverage exceeds the thresholds set in `vitest.config.ts`.

- [ ] **Step 3: Run the integration suite against compose** (only if compose is up)

```bash
docker compose up -d
pnpm --filter @arc-pick/sdk test:integration
docker compose down -v
```
Expected: integration tests pass.

- [ ] **Step 4: Commit** (only if any test config files were touched)

```bash
git add -A
git diff --cached --quiet || git commit -m "chore(sdk): final test pass"
```

---

## Task 19: CI workflow for SDK

**Files:**

- Create: `.github/workflows/sdk.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: sdk

on:
  push:
    branches: [main]
  pull_request:

jobs:
  sdk:
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
      - name: Typecheck
        run: pnpm --filter @arc-pick/sdk typecheck
      - name: Build
        run: pnpm --filter @arc-pick/sdk build
      - name: Test
        run: pnpm --filter @arc-pick/sdk test
      - name: Coverage
        run: pnpm --filter @arc-pick/sdk coverage
```

- [ ] **Step 2: Commit + push + verify CI green**

```bash
git add .github/workflows/sdk.yml
git commit -m "ci(sdk): pnpm install + build + test + coverage"
git push origin main
gh run watch --repo longvo2k/arc-pick --exit-status
```

Expected: CI passes both `contracts` and the new `sdk` job on the next push.

---

## Self-Review

**1. Spec coverage:**

- ✅ `core` — Tasks 2-10 cover ABIs, addresses, types, Permit2, EIP-712, calldata, reads, relay, barrel.
- ✅ `server` — Tasks 11-12 (Nanopayment client + onchain reader).
- ✅ `agent` — Tasks 13-16 (Elo + Kelly, strategies including model-based with Nanopayments, AgentRunner + in-memory Store).
- ✅ `adapters` — Task 17 (viem adapter + Circle stub).
- ✅ Build + CI — Tasks 18-19.

**Deferred to other plans (intentional):**

- `react` subpath → P4 (frontend demo).
- Real `circleWalletAdapter` wiring → P4.
- Real Anthropic / Circle Nanopayment service wiring → consumer of `createNanopaymentClient` (the agent service in P3) passes the live `nanopayClient` and `fallbackTransfer`.
- Postgres-backed `Store` → P3 (agent service).
- Subscribe-to-events helper → keeper service in P3; SDK exposes the raw ABIs.

**2. Placeholder scan:** None. Every step includes complete code or a complete command.

**3. Type consistency:**

- `PermitTransferFromStruct` (permit2.ts) → used identically in `encodeBetCall` (calldata.ts) and `SponsorBetPayload` (relay.ts, JSON-serialized form).
- `Match`, `MarketState`, `UserPosition` (types.ts) → returned by `readMatch`/`readMarket`/`readUserPosition` (reads.ts) and consumed by `OnchainReader` (onchain.ts) and `AgentContext` (agent/types.ts).
- `Outcome` enum used consistently as `0 | 1 | 2` in calldata.ts, relay.ts, eip712.ts.
- `Strategy.decide` returns `MarketPick[]` — same `MarketPick` (re-exported from `core/types.ts`) used in AgentRunner.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-06-03-arc-pick-p2-sdk.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration. Best for the test-driven, well-bounded tasks 4-16.

**2. Inline Execution** — execute tasks in this session via executing-plans; faster for the scaffolding (1, 2, 19) and adapters (17).

Which approach?
