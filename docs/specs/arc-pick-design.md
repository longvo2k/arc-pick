# arc-pick — design spec

**Date:** 2026-06-03
**Status:** Draft, awaiting user review
**Target network:** Arc Testnet (chain ID 5042002)
**Submission target:** Ignyte Stablecoin Commerce Stack Challenge — Track 4 (Best Agentic Economy Experience on Arc), deadline 2026-07-13 (40 days from spec date)

## 1. Summary

`arc-pick` is a FIFA World Cup 2026 prediction market on Arc Testnet. Humans and AI agents stake USDC on per-match 1X2 outcomes (Home / Draw / Away). Stakes flow into a parimutuel pool per market; after a trusted oracle posts the final score, winners claim payouts proportional to their share of the winning outcome.

The AI agent is the centerpiece. Any wallet can deploy a backend agent under a Permit2-capped bankroll. The agent reads open markets, reasons over a chosen strategy (heuristic or LLM-driven), and autonomously places stakes via gasless meta-transactions. The LLM-driven strategy pays per-inference USDC via Circle Nanopayments (or a documented direct-transfer fallback). Two demo bots — `StatHead` (heuristic) and `Vibes` (LLM) — ship with seed capital so the demo has visible activity from day one. A reference Next.js site exercises human bets, agent spawning, leaderboards, and claims.

The build window is 40 days alongside a parallel project (`arc-paywall`). Scope is held tight: 5 contracts, 5 services, 5 demo pages, all minimal. WC 2026 group stage begins 8 days after the spec date, giving the build live tournament data for demo.

## 2. Problem and value

Onchain prediction markets historically fail on two surfaces: clunky wallet UX shuts out non-crypto fans, and gas costs make small (sub-$5) stakes uneconomic. Arc closes both gaps. USDC is the native gas token; fees target ~$0.01 per transaction; Circle Modular Wallets give email+passkey signup so a fan can bet within a minute of arrival.

For the Ignyte Track 4 brief specifically — "AI agents that research, negotiate, and execute transactions on behalf of users" — the product delivers three direct mappings:

- **AI agent autonomously discovers and executes a stablecoin-settled purchase via Arc smart contracts.** Agent service polls `MatchRegistry`, ranks markets, signs and broadcasts `placeBet` transactions on behalf of its owner within a Permit2-capped bankroll.
- **Pay-per-inference AI agents that pay for each model response in real time.** Every LLM call inside the `model-based` strategy triggers a sub-cent USDC payment via Circle Nanopayments (or direct USDC transfer fallback) to a `modelProvider` wallet.
- **Programmable payment authorization with budgets.** Permit2 `AllowanceTransfer` mode lets owners cap agent spend (default 50 USDC ceiling, 30-day expiry) without per-bet confirmation — the agent cannot drain the owner's wallet.

Beyond the brief, the product provides a clean fan-engagement loop: prediction-game framing, no chargeback / dispute layer, transparent settlement, and a public leaderboard mixing humans and agents.

## 3. Goals and non-goals

### Goals

- Solidity contracts deployed on Arc Testnet that handle match registration, bet placement, oracle-driven settlement, and parimutuel claims for arbitrary WC 2026 matches.
- A trusted-key oracle service that polls football-data.org for results and posts EIP-712-signed outcomes.
- An agent runtime that lets any wallet deploy a backend bot under a Permit2 bankroll cap, with three strategy presets (`conservative`, `aggressive`, `model-based`).
- Per-inference Nanopayments for the LLM-driven strategy, with a documented USDC-transfer fallback if Circle Nanopayments is unavailable on Arc Testnet at integration time.
- A TypeScript SDK that integrates into web stacks, with React components for the demo.
- Email-login wallet flow using Circle Modular Wallets so non-crypto fans can bet.
- A reference Next.js demo that exercises every public surface, deployed and pointed at Arc Testnet.
- Two named demo bots seeded with our funds so leaderboard / activity is non-empty.
- Docker-compose local dev environment that brings up the full stack (anvil fork, contracts at deterministic addresses, relay, oracle, keeper, agent) with a single command. This is the canonical dev path.
- Foundry coverage ≥90% on contracts, Vitest for SDK and services, Playwright for end-to-end against the compose stack.

### Non-goals

- Mainnet deployment. Arc has no mainnet as of 2026-06-03.
- Outcome markets beyond 1X2. Over/Under, BTTS, exact-score, multi-market are future work.
- Pool models beyond parimutuel. No CPMM, no orderbook, no fixed-odds bookmaker.
- Live betting (after kickoff). Markets close at kickoff timestamp.
- WC tournament data past 2026-07-13. Knockout R16 (2026-06-28 → 2026-07-01) and Quarter-Finals (2026-07-04) are in scope to the extent they fit before submission; Semis/Final are not in scope.
- Tournament types other than WC 2026. Spec contemplates extensibility (matchId is opaque bytes32) but ships only WC.
- Self-custody wallet flow as primary path. SDK exposes an adapter so a viem client can be plugged in; demo ships Circle adapter only.
- Multi-stablecoin pricing. USDC only.
- Onramp integration. Bettors must hold testnet USDC (Circle Faucet).
- Per-keeper bounty market. Closing and settling markets is a one-keeper job we run; documented as a future-work decentralization step.
- Public agent-strategy sandbox (user-uploaded JS). Strategy choice is from three presets in MVP.
- CCTP, Bridge Kit, Gateway. Gateway is a stretch only if Phase 5 budget is comfortable; CCTP and Bridge Kit are out.

## 4. Architecture

### 4.1 System diagram

```
┌────────────────────────────────────────────────────────────────────┐
│ Frontend (demo/, Next.js 15 App Router)                            │
│  - <MatchGrid> <PlaceBet> <AgentList> <SpawnAgent> <Account>      │
│  - useMatches/useMarket/usePlaceBet/useAgent/useWallet hooks       │
│  - Circle Modular Wallets adapter (email + passkey)                │
└──────┬──────────────────────────────────────────────┬──────────────┘
       │ SSE chain events (Placed, Settled, Claimed)  │
       │                                              │ Permit2 sig + relay POST
       ▼                                              ▼
┌──────────────────────────┐         ┌────────────────────────────────┐
│ Relay (relay/)           │         │ Arc Testnet                    │
│ /api/relay/bet           │────────▶│ ┌────────────────────────────┐ │
│ Paywall pattern reused   │         │ │ MatchRegistry              │ │
└──────────────────────────┘         │ │ Market (per-outcome stakes)│ │
                                     │ │ BetVault (USDC escrow)     │ │
┌──────────────────────────┐         │ │ Oracle (EIP-712 results)   │ │
│ Oracle (oracle/)         │ submits │ │ BetPaymaster (CallFrom)    │ │
│ football-data.org poller │────────▶│ │ USDC + Permit2 (canonical) │ │
│ + EIP-712 signer         │         │ └────────────────────────────┘ │
└──────────────────────────┘         └─────┬──────────────────────────┘
                                           │ events
┌──────────────────────────┐               ▼
│ Keeper (keeper/)         │     ┌─────────────────────────────┐
│ closeMarket @ kickoff    │◀────│ Chain log subscription      │
│ settleMarket post-result │     └─────────────────────────────┘
└──────────────────────────┘
                                     ┌────────────────────────────────┐
┌──────────────────────────┐         │ Agent (agent/)                 │
│ Model provider wallet    │◀────────│ Per (owner, strategy) service  │
│ (receives Nanopayments)  │ ~0.001  │ Polls markets, picks bets,     │
└──────────────────────────┘ USDC    │ pays per LLM call              │
                             /call   └──────┬─────────────────────────┘
                                            │ direct placeBet (agent gas in USDC)
                                            ▼
                                  ┌──────────────────────────────────┐
                                  │ BetVault.placeBet (Permit2 pull) │
                                  └──────────────────────────────────┘
```

### 4.2 Repository layout

```
arc-pick/
├── contracts/             Foundry: MatchRegistry, Market, BetVault, Oracle, BetPaymaster + mocks
│   ├── src/
│   ├── script/            Deploy + post-deploy wiring
│   └── test/              unit/ fuzz/ invariant/ integration/
├── sdk/                   @arc-pick/sdk TypeScript package (pnpm workspace)
│   ├── src/core/          ABIs, types, Permit2 builders (isomorphic)
│   ├── src/react/         Components + hooks
│   ├── src/server/        RPC helpers, Nanopayments wrapper (Node only)
│   ├── src/agent/         Agent harness, Strategy interface, three presets
│   └── src/adapters/      Circle Modular Wallets adapter, viem escape hatch
├── relay/                 Fastify paymaster relayer (paywall pattern, adapted)
├── oracle/                football-data.org poller + EIP-712 signer service
├── keeper/                Market lifecycle driver
├── agent/                 Agent runner service (Docker), runs demo bots and user agents
├── demo/                  Next.js 15 App Router reference site
├── compose-init/          Foundry-cast scripts to deploy contracts at deterministic addresses
└── docker-compose.yml     Brings the whole stack up locally
```

### 4.3 Actors

| Actor | Role |
|---|---|
| Bettor | Human fan. Signs in via Circle Modular Wallets (email + passkey). Places one-off bets via paymaster meta-transaction. |
| Agent owner | Human. Signs Permit2 AllowanceTransfer once (cap = bankroll). Spawns a backend agent under their wallet. |
| Agent service | Backend process per (ownerWallet, strategyId). Polls open markets, runs strategy, places bets within cap. Pays Nanopayments for LLM calls. |
| Demo bot | Two named bots (`StatHead`, `Vibes`) running on agent service with our seed wallets. Provide visible leaderboard activity. |
| Oracle operator | Us. Runs oracle service that polls football-data.org and signs EIP-712 results. |
| Keeper | Us. Calls `closeMarket(matchId)` at kickoff and triggers `settleMarket` after oracle posts. Documented future-work: open up via bounty. |
| Relayer | Us. Paymaster meta-tx forwarder for human bets. Paywall pattern reused. |

## 5. Contracts

Solidity ^0.8.24, OpenZeppelin where idiomatic, Foundry for build and test.

### 5.1 `MatchRegistry.sol`

Tracks match metadata and lifecycle.

```solidity
enum Status { Unknown, Open, Closed, Settled, Voided }

struct Match {
    bytes32 homeTeam;      // e.g. keccak("ARG"), team code
    bytes32 awayTeam;
    uint64  kickoff;       // unix seconds
    Status  status;
    uint8   winningOutcome; // 0=Home, 1=Draw, 2=Away; valid only when status == Settled
}

mapping(bytes32 => Match) public matches;   // key = matchId = keccak256("FIFA-WC26-${footballDataMatchId}")
address public oracle;                       // owner-settable
address public betVault;                     // owner-settable, only address allowed to mark Settled
address public owner;
```

**Functions:**

| Function | Caller | Behavior |
|---|---|---|
| `upsertMatch(matchId, homeTeam, awayTeam, kickoff)` | `onlyOracle` | Inserts if `status == Unknown`; allows kickoff update if still `Open` (football-data.org schedule slip). Reverts if `Closed`/`Settled`. Emits `MatchAdded` or `MatchRescheduled`. |
| `closeMarket(matchId)` | Any | Reverts unless `Open` and `block.timestamp >= kickoff`. Transitions to `Closed`. Emits `MarketClosed`. |
| `markSettled(matchId, winningOutcome)` | `onlyBetVault` | Transitions `Closed` → `Settled` and records winning outcome. Emits `MatchSettled`. Triggered keeper-side: after `Oracle.submitResult` writes `results[matchId]`, anyone (keeper) calls `BetVault.settleMarket(matchId)`, which reads the oracle result, derives the outcome, and calls `MatchRegistry.markSettled`. Two separate transactions decouple oracle data write from BetVault state transition. |
| `voidMatch(matchId)` | `onlyOracle` | Transitions to `Voided` (for abandoned/cancelled fixtures). Enables refund path on BetVault. Emits `MatchVoided`. |
| `setOracle(addr)`, `setBetVault(addr)` | `onlyOwner` | Wiring at deploy + emergency rotation. |

**Events:** `MatchAdded`, `MatchRescheduled`, `MarketClosed`, `MatchSettled`, `MatchVoided`, `OracleUpdated`, `BetVaultUpdated`.

**Invariants:**

1. Status is monotone forward: `Unknown → Open → Closed → Settled` or `... → Voided` from any pre-Settled state.
2. `winningOutcome` is only meaningful when `status == Settled`. Reads should check status first.

### 5.2 `Market.sol`

Pure accounting. Stores per-outcome and per-user-per-outcome stake totals. Only `BetVault` mutates it.

```solidity
mapping(bytes32 => uint128[3]) public outcomeStake;                       // [home, draw, away]
mapping(bytes32 => mapping(address => uint128[3])) public userStake;
address public immutable betVault;

function recordStake(bytes32 matchId, address user, uint8 outcome, uint128 amount) external onlyVault;

// views
function totalPool(bytes32 matchId) external view returns (uint256);
function impliedProb(bytes32 matchId, uint8 outcome) external view returns (uint128 num, uint128 denom);
    // num = outcomeStake[m][outcome], denom = sum(outcomeStake[m]). Returns (0,0) if pool empty.
function userTotalStake(bytes32 matchId, address user) external view returns (uint256);
```

**Events:** `StakeRecorded(matchId, user, outcome, amount)`.

**Invariants:**

1. `sum(outcomeStake[m]) == sum over all users sum over outcomes of userStake[m][u][o]`.
2. `outcomeStake[m]` and `userStake[m][u]` are monotone non-decreasing (no pre-settle deductions).
3. Outcome index is always 0, 1, or 2. `recordStake` reverts otherwise.

### 5.3 `BetVault.sol`

USDC custody, bet placement, payouts, and refunds. The only contract that touches user funds.

```solidity
IERC20      public immutable USDC;
IPermit2    public immutable PERMIT2;
MatchRegistry public immutable REGISTRY;
Market        public immutable MARKET;
Oracle        public immutable ORACLE;

uint64 public constant REFUND_AFTER = 7 days;            // post-kickoff if not Settled
mapping(bytes32 => mapping(address => bool)) public claimed;
mapping(bytes32 => mapping(address => bool)) public refunded;

// Owner authorizes a specific agent runtime key to drive `placeBetFromAllowance` on their behalf.
// Without this gate, any address could spend the owner's public Permit2 allowance on losing bets.
mapping(address => mapping(address => bool)) public authorizedAgent; // owner => agent => allowed
```

**Functions:**

| Function | Caller | Behavior |
|---|---|---|
| `placeBet(matchId, outcome, amount, permit, sig)` | Bettor (direct or via Paymaster CallFrom). Bettor = `msg.sender` (or the address `CallFrom` impersonates). | Reverts unless `registry.status == Open` and `block.timestamp < kickoff`. Pulls `amount` USDC via `Permit2.SignatureTransfer.permitTransferFrom` from `bettor`. Calls `MARKET.recordStake(matchId, bettor, outcome, amount)`. Emits `Placed`. nonReentrant. Used by humans (one-shot Permit2 sig). |
| `placeBetFromAllowance(matchId, outcome, amount, bettor)` | An agent runtime key with `authorizedAgent[bettor][msg.sender] == true`. | Reverts unless caller is authorized for `bettor`, `registry.status == Open`, and `block.timestamp < kickoff`. Pulls `amount` USDC via `Permit2.AllowanceTransfer.transferFrom(bettor, vault, amount, USDC)`. Calls `MARKET.recordStake(matchId, bettor, outcome, amount)`. Emits `Placed`. nonReentrant. Used by agents: the owner is the `bettor`; only the agent runtime key the owner authorized can drive it. |
| `authorizeAgent(address agent)` | Owner (`msg.sender`) | Sets `authorizedAgent[msg.sender][agent] = true`. Emits `AgentAuthorized(owner, agent)`. Called at agent spawn time, signed by owner. |
| `deauthorizeAgent(address agent)` | Owner (`msg.sender`) | Sets `authorizedAgent[msg.sender][agent] = false`. Emits `AgentDeauthorized`. Owner kill-switch. |
| `settleMarket(matchId)` | Any | Reverts unless `registry.status == Closed` and `ORACLE.results[matchId].signedAt != 0`. Reads result, derives outcome (0/1/2 from scores), calls `REGISTRY.markSettled`. Emits `Settled`. |
| `claim(matchId)` | Winner | Calls `claimFor(matchId, msg.sender)`. Convenience for humans. |
| `claimFor(matchId, user)` | Anyone | Reverts unless `Settled` and `!claimed[m][user]` and `userStake[m][user][winningOutcome] > 0`. Payout = `userStake[m][user][winningOutcome] × totalPool / outcomeStake[winningOutcome]`. Marks claimed; transfers USDC to `user`. nonReentrant. Lets keeper / agent service claim on behalf of any winner. |
| `refund(matchId)` | User with stake (msg.sender) | Calls `refundFor(matchId, msg.sender)`. |
| `refundFor(matchId, user)` | Anyone | Reverts unless (`status == Voided`) OR (`status != Settled` and `block.timestamp >= kickoff + REFUND_AFTER`). Reverts unless `userTotalStake[m][user] > 0` and `!refunded[m][user]`. Marks refunded; transfers USDC to `user`. nonReentrant. |

**Edge case — empty winning pool.** If the oracle's outcome corresponds to `outcomeStake[winningOutcome] == 0` (no one bet the right way), settlement still sets `Settled`, but no claim will succeed. The pool is reachable only via `refund` after `REFUND_AFTER`. Document; do not paper over.

**Edge case — single-outcome pool.** If only one outcome received stakes and it wins, each bettor reads `userStake × totalPool / outcomeStake == userStake × 1`. They get exactly their stake back. Correct.

**Events:** `Placed`, `Settled`, `Claimed`, `Refunded`, `AgentAuthorized`, `AgentDeauthorized`.

**Invariants:**

1. `USDC.balanceOf(vault) >= sum(unsettled outcome stakes) + sum(settled unclaimed payouts)`.
2. `claimed[m][u] == true` implies `userStake[m][u]` has been fully paid out for `m`.
3. `claimed[m][u] && refunded[m][u]` is impossible (mutually exclusive; checked in functions).
4. Payout to a single user never exceeds `totalPool[m]`.

### 5.4 `Oracle.sol`

Trusted-key result poster. EIP-712 signed by an off-chain `signer` key controlled by the oracle service.

```solidity
struct Result { uint8 homeScore; uint8 awayScore; uint64 signedAt; }
mapping(bytes32 => Result) public results;

address public signer;
MatchRegistry public immutable REGISTRY;
address public owner;

bytes32 public constant RESULT_TYPEHASH = keccak256("Result(bytes32 matchId,uint8 homeScore,uint8 awayScore,uint64 signedAt,uint256 chainId)");
```

**Functions:**

| Function | Caller | Behavior |
|---|---|---|
| `submitResult(matchId, homeScore, awayScore, signedAt, sig)` | Any | Recovers signer from EIP-712 typed data. Reverts unless recovered address matches `signer`, `signedAt > 0`, `signedAt <= block.timestamp`, and `results[matchId].signedAt == 0` (first writer wins). Writes result. Emits `ResultSubmitted`. |
| `voidMatch(matchId)` | `onlyOwner` | Calls `REGISTRY.voidMatch(matchId)` for abandoned games. Emits `MatchVoided`. |
| `setSigner(addr)` | `onlyOwner` | Rotate. Emits `SignerUpdated`. |

**Events:** `ResultSubmitted`, `MatchVoided`, `SignerUpdated`.

**Invariants:**

1. `results[matchId]` is write-once.
2. `signedAt <= block.timestamp` at write time.

**Future-work hardening:** rotate `signer` to a 2-of-3 multi-sig, then to an optimistic posting with USDC bond and 24h dispute window. Documented; not built.

### 5.5 `BetPaymaster.sol`

Gasless bet UX for humans. Bettor signs an EIP-712 message off-chain; the relayer submits a paymaster transaction; the paymaster uses Arc's `CallFrom` precompile to invoke `BetVault.placeBet` with `msg.sender == bettor`.

```solidity
IERC20      public immutable USDC;
BetVault    public immutable VAULT;
address     public publisher;                 // a.k.a. owner; can fund/withdraw
mapping(address => uint256) public nonces;
mapping(address => uint64)  public lastSponsoredAt;
uint64 public constant MIN_SPONSOR_INTERVAL = 30 seconds;

address public constant CALL_FROM = 0x...; // Arc CallFrom precompile; confirm at integration
```

**Functions:**

| Function | Caller | Behavior |
|---|---|---|
| `fund(uint256 amount)` | Any | Pulls USDC. For gas reimbursement budget. |
| `withdraw(uint256 amount)` | `onlyPublisher` | Drain to publisher. Cannot touch bettor funds (those live in bettor wallets behind Permit2). |
| `sponsorBet(bettor, matchId, outcome, amount, permit, permitSig, userSig, deadline)` | `onlyRelayer` | Verifies `userSig` is EIP-712 over `(bettor, matchId, outcome, amount, nonce, deadline, chainId)`. Reverts on expiry, nonce reuse, sub-interval. Increments nonce. Calls `CallFrom(bettor, VAULT, abi.encodeCall(BetVault.placeBet, (matchId, outcome, amount, permit, permitSig)))`. Gas paid from this contract's USDC. |
| `setRelayer(addr)`, `setPublisher(addr)` | `onlyPublisher` | Operational. |

**Events:** `Sponsored`, `PaymasterFunded`, `PaymasterWithdrew`, `RelayerUpdated`, `PublisherUpdated`.

**Why agents bypass the paymaster.** Agents pay their own gas in USDC (Arc native gas token) so the Permit2 allowance cap is the *only* spend surface for an agent's owner. Routing through the paymaster would mean the agent's budget is the cap *plus* paymaster-funded gas, which is harder to reason about. Agents top up their own minimal USDC float at spawn time (`amount = capUsdc + 0.5 USDC for gas`).

### 5.6 Permit2 usage notes

- Canonical Permit2 on Arc Testnet: `0x000000000022D473030F116dDEE9F6B43aC78BA3`.
- Human one-off bet: `PermitTransferFrom` (single-use sig binds to nonce, amount, deadline, spender = BetVault).
- Agent recurring bets: `AllowanceTransfer` (cap = bankroll ceiling, expiration = 30 days default, configurable in SDK). BetVault pulls within cap per bet.
- Owner cancels agent: calls `Permit2.lockdown([(USDC, BetVault)])` to revoke. SDK exposes `useAgent().pause()`.

### 5.7 Security checklist

| Concern | Mitigation |
|---|---|
| Replay of `sponsorBet` sig | Nonce + deadline in EIP-712, checked in BetPaymaster |
| Reentrancy on `claim`/`refund` | Checks-effects-interactions; `claimed` / `refunded` flag set before transfer; `nonReentrant` |
| Two `settleMarket` callers race | First wins, second reverts at `registry.status == Closed` check |
| Oracle key compromise | `setSigner` for rotation; events for transparency; future multi-sig path |
| Football-data.org wrong/late | Owner `voidMatch` triggers refund; documented as a known trust assumption |
| Permit2 allowance never expiring | SDK default 30 days; `useAgent().pause()` revokes |
| Publisher drains bettor funds | Paymaster `withdraw` touches only paymaster's own USDC; bettor USDC is custodied in Permit2 |
| Empty winning pool | Falls into refund path post `REFUND_AFTER`; documented |
| Frontrunning of `placeBet` to game pool weights | Acceptable: pool moves continuously; pre-kickoff cutoff is fixed; agents factor this into strategy |
| Settling with mismatched scores | Oracle EIP-712 signature over the exact tuple prevents tampering |
| Attacker spends owner's public Permit2 allowance on losing bets | `authorizedAgent[owner][caller]` gate on `placeBetFromAllowance`. Only the runtime key the owner authorized at spawn time can drive bets. Owner kill-switch via `deauthorizeAgent`. |
| Agent runtime key compromise | Attacker can spend within cap on losing bets (no exfiltration of funds — they go to BetVault). Mitigation: cap is the only damage surface; owner can `deauthorizeAgent` immediately; future multi-key authorization is a hardening path. |

## 6. SDK (`@arc-pick/sdk`)

Published TypeScript package with five tree-shakeable subpaths.

### 6.1 `core` (isomorphic)

```ts
// Permit2 builders
buildBetPermit({ bettor, vault, amount, deadline, signer }):
  Promise<{ permit: PermitTransferFrom, sig: Hex }>

buildAgentAllowance({ owner, vault, capUsdc, expiry, signer }):
  Promise<{ permitBatch: AllowanceBatch, sig: Hex }>

// EIP-712 message builders
buildSponsorBetSig({ bettor, matchId, outcome, amount, nonce, deadline, paymaster, chainId, signer }):
  Promise<Hex>

// Calldata
encodeBetCall({ matchId, outcome, amount, permit, sig }): Hex
encodeClaimCall(matchId): Hex
encodeRefundCall(matchId): Hex

// Reads
readMatch({ rpcUrl, registry, matchId }):
  Promise<{ homeTeam, awayTeam, kickoff, status, winningOutcome }>
readMarket({ rpcUrl, market, matchId }):
  Promise<{ outcomeStake: [bigint, bigint, bigint], impliedProb: [number, number, number] }>
readUserPosition({ rpcUrl, market, vault, wallet, matchId }):
  Promise<{ stakes: [bigint, bigint, bigint], claimed: boolean, refunded: boolean }>
listOpenMatches({ rpcUrl, registry, kickoffAfter, limit }): Promise<Match[]>

// Paymaster relay
sponsorBet({ relayUrl, payload }): Promise<{ txHash: Hex }>
```

### 6.2 `react`

```tsx
<ArcPickProvider config={{
  chain: arcTestnet,
  registry: "0x...", market: "0x...", vault: "0x...",
  oracle: "0x...", paymaster: "0x...",
  relayUrl: "/api/relay/bet",
  walletAdapter: circleWalletAdapter(),
}}>

useMatches({ status?, kickoffAfter? }): { matches, isLoading, refetch }
useMarket(matchId): { pool, impliedProb, userPosition, refetch }
usePlaceBet(matchId): { placeBet({ outcome, amount }), isPending, error }
useClaim(matchId): { claim(), isPending, error }
useAgent(ownerAddr): {
  status: 'none'|'spawning'|'active'|'paused'|'expired',
  strategy, capUsdc, spentUsdc, openPositions, totalPnL,
  spawn({ strategy, capUsdc, expiryDays }),
  pause(), topUp(amount),
}
useWallet(): { address, status, signIn(email), signOut() }
useLeaderboard({ window }): { entries: { wallet, label?, pnl, betsPlaced, winRate }[] }
```

### 6.3 `server` (Node only)

```ts
createOnchainReader({ rpcUrl, addrs }) → {
  isMatchSettled(matchId): Promise<boolean>;
  hasUserClaimed(matchId, user): Promise<boolean>;
  totalPool(matchId): Promise<bigint>;
}

createNanopaymentClient({ apiKey, modelProviderWallet, fallbackUsdcContract, signer }) → {
  pay({ amountUsdc, memo }): Promise<{ txHash, method: 'nanopay'|'usdc-transfer' }>;
}
```

The Nanopayment client tries Circle Nanopayments first (if available on Arc Testnet at runtime) and falls back to a direct `USDC.transferFrom(agentWallet, modelProviderWallet, amount)` with the method recorded in the return value. Both paths emit consistent telemetry.

### 6.4 `agent`

```ts
interface AgentContext {
  ownerWallet: `0x${string}`;
  capUsdc: bigint;                // remaining bankroll
  matchesOpen: Match[];           // from registry, kickoff > now + minLeadSeconds
  pools: Map<bytes32, MarketState>;
  history: Bet[];                 // owner's stake history this session
  rng: () => number;              // seeded for determinism in tests
}

interface Strategy {
  name: string;
  decide(ctx: AgentContext): Promise<Pick[]>;
}
interface Pick { matchId: `0x${string}`; outcome: 0|1|2; amount: bigint; rationale?: string; }

class AgentRunner {
  constructor(opts: {
    ownerWallet, signer, capUsdc, modelProviderWallet,
    strategy: Strategy, addrs, rpcUrl, telemetry?
  });
  start(): Promise<void>;     // begins tick loop
  pause(): Promise<void>;
  status(): AgentStatus;
}

const Strategies = {
  conservative: () => Strategy,
  aggressive: () => Strategy,
  modelBased: ({ anthropicKey, nanopaymentClient }) => Strategy,
};
```

### 6.5 `adapters`

- `@arc-pick/sdk/adapters/circle`: wraps Circle Modular Wallets SDK.
- `@arc-pick/sdk/adapters/viem`: thin viem `WalletClient` adapter for self-custody (escape hatch).

## 7. Oracle service (`oracle/`)

Node service. Single Fastify process. Two responsibilities.

### 7.1 Match ingestion

- Polls `https://api.football-data.org/v4/competitions/WC/matches` every 10 minutes.
- Free tier: 10 requests/minute. Sufficient.
- For each match with `status == SCHEDULED`:
  - Compute `matchId = keccak256(abi.encodePacked("FIFA-WC26-", uint256(fd_match_id)))`.
  - If `MatchRegistry.matches[matchId].status == Unknown`, call `upsertMatch`. Bot pays Arc gas in USDC (small float).
  - If `Open` and kickoff has shifted by >2 minutes, re-upsert. (Real schedule slips happen.)

### 7.2 Result signing

- Polls same endpoint for `status == FINISHED`.
- For each such match where `Oracle.results[matchId].signedAt == 0`:
  - Build EIP-712 result payload.
  - Sign with `ORACLE_SIGNER_KEY`.
  - POST the signature to a public path (`GET /sigs/:matchId`) so anyone can submit.
  - Also auto-submit to `Oracle.submitResult` (keeper-style) using a separate `ORACLE_SUBMITTER_KEY` (so the signing key never holds funds or signs raw transactions).

### 7.3 Config (env)

```
RPC_URL                  http://anvil:8545 (dev) | https://rpc.testnet.arc.network
REGISTRY                 0x...
ORACLE                   0x...
ORACLE_SIGNER_KEY        0x...   # EIP-712 only
ORACLE_SUBMITTER_KEY     0x...   # holds small USDC float for gas
FOOTBALL_DATA_API_BASE   https://api.football-data.org/v4
FOOTBALL_DATA_API_KEY    (optional, free tier works for WC)
POLL_INTERVAL_SECONDS    600
```

## 8. Keeper bot (`keeper/`)

Standalone Node service using viem. Runs in compose. Pattern reused from paywall.

### 8.1 Algorithm

```
On startup:
  Scan MatchAdded events since startBlock; build in-memory schedule.
  Subscribe to MatchAdded, MarketClosed, MatchSettled, ResultSubmitted via WebSocket.

Every 60 seconds:
  for match in schedule where status == Open and now >= kickoff:
    eth_call MatchRegistry.closeMarket(matchId)
    if simulation ok: submit tx (keeper pays own gas)

  for match in schedule where status == Closed and ORACLE.results[matchId].signedAt > 0:
    eth_call BetVault.settleMarket(matchId)
    if simulation ok: submit tx
```

### 8.2 Why no bounty?

In MVP, closing and settling is unrewarded — the keeper is us. Decentralization (per-match closer bounty paid from a tiny treasury) is a documented future-work item. The reason: the bounty market is real engineering (treasury, profit gating, keeper docs) that does not improve the demo story and competes for the 40-day budget.

### 8.3 Config (env)

```
RPC_URL              ws://anvil:8545 | wss://rpc.testnet.arc.network
REGISTRY             0x...
ORACLE               0x...
VAULT                0x...
KEEPER_PRIVATE_KEY   0x...
START_BLOCK          0
TICK_SECONDS         60
```

## 9. Relay service (`relay/`)

Fastify, paywall pattern, paywall code informs but does not import.

**Endpoint:**

```
POST /api/relay/bet
Body: { bettor, matchId, outcome, amount, permit, permitSig, userSig, deadline }
Response: { txHash }
```

Service signs and broadcasts a call to `BetPaymaster.sponsorBet`. Holds a hot key (relayer); the paymaster reimburses gas from its own USDC float.

Rate limiting: per-IP and per-bettor sliding windows (default 5 req / minute / wallet). Configurable via env. Stateless except nonce dedup (in-memory Map, Redis-friendly interface).

## 10. Agent runtime (`agent/`)

Single Node service, container-deployed. Per (ownerWallet, strategyId) worker. State: in-memory + a small Postgres for spawn registry, restart resilience, and telemetry. The same image runs the two demo bots and all user-spawned agents.

### 10.1 Lifecycle

```
1. Spawn (POST /control/spawn from Next.js API or operator script):
   payload: { ownerWallet, strategy, capUsdc, expirySeconds, allowanceSig, authorizeAgentTx, modelProviderWallet? }
   Action:
     - Generate a fresh agent runtime key (EOA) for this (owner, strategy).
     - Verify `allowanceSig` ratifies a Permit2 AllowanceTransfer (owner -> spender=BetVault, amount=capUsdc, expiration).
     - Verify `authorizeAgentTx` is a signed tx (or meta-tx through relay) of `BetVault.authorizeAgent(runtimeKey)` from owner.
     - Submit both to chain (allowance first, then authorize).
     - Fund runtime key with ~0.5 USDC for gas from platform float.
     - Insert row into `agents` (Postgres) with status `active`.
     - Spawn worker.

2. Worker tick (every 60s):
   a. Fetch open matches with kickoff > now + 5 min.
   b. Compute `remaining = capUsdc - sumPlacedFor(ownerWallet)`.
   c. picks = await strategy.decide(ctx).
   d. For each pick: if remaining >= pick.amount, broadcast BetVault.placeBetFromAllowance(matchId, outcome, amount, ownerWallet) signed by runtime key. Persist Bet row. Subtract amount.

3. Settle / claim sweep (every 60s):
   For matches in agent history where registry.status == Settled and !claimed:
     Submit BetVault.claimFor(matchId, ownerWallet). Persist payout. (Funds go to owner; agent runtime key just pays gas.)

4. Pause (POST /control/pause):
   Worker stops new picks; sweep continues. Optionally calls Permit2.lockdown via owner sig.

5. Expire:
   Once `Permit2.allowance(owner, USDC, BetVault).expiration < now`, worker self-stops, status -> `expired`.
```

### 10.2 Strategies

| Strategy | Method | LLM calls? | Nanopayments |
|---|---|---|---|
| `conservative` | Kelly ¼ on outcomes where heuristic Elo-derived prob exceeds implied prob by ≥5 pts. Max one bet per match. Min stake 0.5 USDC. | None | None |
| `aggressive` | Kelly full + underdog tilt: when implied prob ≤ 25%, multiply stake by 1.25. Min stake 0.5 USDC. | None | None |
| `model-based` | For each open match without a pick yet: build a short prompt (teams, kickoff, current pool weights, recent form summary if available); call `messages.create` on Anthropic API expecting JSON `{ outcome: 0|1|2, confidence: 0..1, sizeBps: 1..10000, rationale: string }`. Place stake = `confidence * remaining * sizeBps/10000`, gated by min/max. One call per match per agent per 1h. | Yes | Yes (each call) |

Elo source: a static, hand-curated table of FIFA WC 2026 team strength priors checked into `agent/data/team-elo.json`. Updated manually a few times per round. Documented as a known shortcut for the 40-day build; future-work item is to pull from a real Elo source.

### 10.3 Per-inference Nanopayments

Each LLM call:

```ts
const result = await nanopayClient.pay({ amountUsdc: 0.001n * 10n**6n, memo: `agent:${ownerWallet}:${matchId}` });
const completion = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', ... });
```

The client tries Circle Nanopayments first; if the SDK or network does not support it, it falls back to `USDC.transferFrom(agentRuntimeKey, modelProviderWallet, amount)`. The fallback method is recorded in telemetry so the demo can show, honestly, which path is live.

`modelProviderWallet` is configurable per agent: by default it's the platform wallet we operate (which is the "inference provider"). In future-work an operator could plug in any wallet — opens the door to multi-provider routing.

### 10.4 Config (env)

```
RPC_URL                       http://anvil:8545 | https://rpc.testnet.arc.network
ADDRS_REGISTRY/MARKET/VAULT   0x...
AGENT_RUNTIME_KEY             0x...   # one key per (owner, strategy), generated at spawn
ANTHROPIC_API_KEY             ...     # only for model-based agents
NANOPAY_API_KEY               ...     # optional, falls back to direct USDC transfer
MODEL_PROVIDER_WALLET         0x...
POSTGRES_URL                  ...
TICK_SECONDS                  60
```

### 10.5 Demo bots

| Bot | Owner wallet | Strategy | Cap | Notes |
|---|---|---|---|---|
| `StatHead` | Seeded by us | `conservative` | 100 USDC | "Boring Kelly with home-court adjustment" |
| `Vibes` | Seeded by us | `model-based` | 100 USDC | "LLM picks, narrates rationale" |

Both spawn at compose startup via `compose-init/seed-bots.sh`.

## 11. Reference demo (`demo/`)

Next.js 15 App Router, viem, Circle Modular Wallets SDK, Tailwind, SSE for live updates, Prisma + SQLite for off-chain UI metadata (display labels, agent narrations).

| Route | Purpose |
|---|---|
| `/` | Landing — pitch, "Live now" open match grid, leaderboard top 5 |
| `/match/[id]` | Match card: teams, kickoff countdown, pool weights, implied probabilities, place bet UI |
| `/agents` | List active agents (demo bots + user-spawned); 24h P&L, holdings, last-tick timestamp |
| `/agents/new` | Spawn an agent: pick strategy preset, set cap, set expiry, sign Permit2 allowance, agent boots |
| `/account` | Wallet, balance, open positions, settled positions, batched claim |
| `/leaderboard` | All-time P&L for human bettors and agents |
| `/api/relay/bet` | Proxies to local relay service |
| `/api/agent/spawn` | Proxies to agent service control plane |
| `/api/sse/events` | SSE: chain events (Placed, Settled, Claimed) for live updates |

Realtime: a thin Next.js route subscribes to chain logs via WebSocket, dedups, and pushes updates over SSE to the client. No DB writes in the SSE path.

## 12. Data flows

### 12.1 Human bet (gasless)

```
1. User opens /match/[id], picks outcome and amount.
2. SDK builds Permit2 PermitTransferFrom (single-use, spender = BetVault).
3. Circle Modular Wallets signs.
4. SDK builds sponsorBet EIP-712 (bettor, matchId, outcome, amount, nonce, deadline).
5. Circle signs again.
6. POST /api/relay/bet → relay service.
7. Relay → BetPaymaster.sponsorBet → CallFrom → BetVault.placeBet.
8. SDK polls readUserPosition until amount appears → toast "Bet placed".
```

### 12.2 Agent spawn

```
1. Owner opens /agents/new, picks strategy, cap, expiry.
2. SDK generates a fresh agent runtime EOA client-side, returns its address.
3. SDK builds two artifacts for owner to sign:
   a. Permit2 AllowanceTransfer (USDC -> BetVault, amount = cap, expiration).
   b. Meta-tx for `BetVault.authorizeAgent(runtimeAddress)`.
4. Circle Modular Wallets signs both (one or two prompts depending on Permit2 batching support).
5. POST /api/agent/spawn with { strategy, capUsdc, expirySeconds, allowanceSig, authorizeMetaTx, runtimeAddress, ownerWallet }.
6. Next.js forwards to agent service /control/spawn.
7. Agent service verifies allowance sig and authorizeMetaTx, submits both on-chain (relayer-funded), funds runtime key with 0.5 USDC gas float, persists agent row, spawns worker.
8. UI redirects to /agents, new row appears with status `active`.
```

### 12.3 Agent bet

```
On each tick:
  Worker fetches open matches via readMatch + listOpenMatches.
  Worker calls strategy.decide(ctx).
  For each pick within remaining cap:
    If model-based: pay Nanopayment (or USDC.transferFrom) to modelProviderWallet (~0.001 USDC).
    Build placeBetFromAllowance(matchId, outcome, amount, ownerWallet) calldata. No per-bet Permit2 sig needed — the owner's AllowanceTransfer (signed once at spawn) authorizes BetVault to pull within cap.
    Sign with AGENT_RUNTIME_KEY (pays Arc gas in USDC from agent's small float). Broadcast. Wait for receipt.
    Persist Bet row.
```

### 12.4 Settlement and claim

```
Match status: Open at create → Closed by keeper at kickoff → Settled when oracle posts + keeper triggers BetVault.settleMarket.

Oracle service:
  Polls football-data.org, sees status FINISHED.
  Builds EIP-712 result, signs.
  Publishes signature, also self-submits Oracle.submitResult.

Keeper service:
  Sees ResultSubmitted, calls BetVault.settleMarket(matchId).
  BetVault: reads Oracle.results, derives outcome, calls MatchRegistry.markSettled.

Winners (humans):
  /account shows claim button. User clicks → BetVault.claim(matchId). USDC arrives.

Winners (agents):
  Agent worker sees Settled event → BetVault.claimFor(matchId, ownerWallet) → USDC arrives at owner wallet → P&L updates in /agents.
```

### 12.5 Refund (void or stuck)

```
If Oracle.voidMatch is called OR registry.status != Settled and now >= kickoff + 7 days:
  Any user with stake calls BetVault.refund(matchId).
  Refund = sum of userStake across all outcomes. USDC returned.
```

## 13. Error handling

| Failure | Detection | Handling |
|---|---|---|
| Permit2 sig expired | `placeBet` reverts | SDK shows "Signature expired, retry" |
| Bettor USDC balance < amount | `Permit2.permitTransferFrom` reverts | SDK shows "Insufficient USDC, faucet?" with Circle Faucet link |
| Agent cap exhausted | Worker check before broadcasting | Worker pauses new picks; surfaces status `expired-cap` in UI |
| Permit2 allowance expired | `placeBet` reverts on `Permit2.transferFrom` | Worker sees revert; auto-pauses agent; UI prompts owner to top-up |
| Paymaster out of USDC | `sponsorBet` reverts | Relay returns 503; SDK shows "Betting temporarily unavailable"; ops alerts |
| Oracle sig invalid | `Oracle.submitResult` reverts | Oracle service logs; alert; manual investigation |
| football-data.org outage | Oracle poller catches | Retry w/ backoff; if down >24h, manual override path documented |
| Empty winning pool | Settles cleanly; no successful claims | Falls into refund path after `REFUND_AFTER` |
| Two keepers race on close/settle | One wins; other reverts | Both keepers continue; no double-spend |
| Anthropic API outage | Strategy throws | Worker logs and skips pick this tick; no Nanopayment charged on failure |
| Nanopayment fallback path failure | `USDC.transferFrom` reverts | Skip the LLM call entirely; do not bet without a paid inference |
| User claims twice | `claimed[m][u] == true` check | Reverts |
| Refund attempted before `REFUND_AFTER` | Time check | Reverts |
| Refund attempted after `Settled` | Status check | Reverts |

## 14. Local development environment

Docker compose is the canonical dev path. Everything runs in `docker compose up`; the Next.js demo runs on the host pointing at the stack.

### 14.1 Services

```
docker-compose.yml
├── anvil          Foundry anvil fork of Arc Testnet (preset: rpcUrl=https://rpc.testnet.arc.network)
├── deploy         One-shot: deploys contracts at deterministic addresses (uses CREATE2), wires registry↔vault↔market↔oracle↔paymaster, mints faucet USDC to demo wallets
├── seed-bots      One-shot: spawns StatHead and Vibes bots with seed USDC and Permit2 allowance
├── oracle         Node service (Section 7)
├── keeper         Node service (Section 8)
├── relay          Fastify service (Section 9)
├── agent          Node service (Section 10), runs demo bots + receives spawn requests
└── postgres       For agent service state
```

### 14.2 Setup

```
git clone arc-pick && cd arc-pick
pnpm install
docker compose up           # brings up anvil + deploys + services
pnpm --filter demo dev      # Next.js on http://localhost:3000
```

Demo wallets are minted USDC at deploy time; no manual faucet needed for compose dev. Production deploys (`pnpm deploy:testnet`) hit Arc Testnet directly using a separate set of scripts in `contracts/script/`.

### 14.3 Resetting

```
docker compose down -v      # wipes anvil state
docker compose up           # fresh deploy at same deterministic addresses
```

## 15. Testing strategy

### 15.1 Contracts (Foundry)

**Unit tests** (`contracts/test/unit/`): one file per contract, every state transition. Critical boundaries:

| Test | Expected |
|---|---|
| `placeBet` after kickoff | revert |
| `placeBet` while `Open` | success |
| `placeBet` while `Closed` | revert |
| `claim` before `Settled` | revert |
| `claim` twice | second reverts |
| `claim` by user with 0 stake on winning outcome | revert (`userStake[m][user][winningOutcome] == 0`) |
| `refund` before `REFUND_AFTER` and `status != Voided` | revert |
| `refund` after `REFUND_AFTER` and `status != Settled` | success |
| `refund` after `Settled` | revert |
| `refund` then `claim` for same user/match | second reverts |
| `settleMarket` before result posted | revert |
| `submitResult` with wrong sig | revert |
| `submitResult` twice | second reverts |
| `closeMarket` before kickoff | revert |
| Two `closeMarket` callers race | one wins |
| `sponsorBet` replay | revert |
| `sponsorBet` past deadline | revert |
| `voidMatch` then `refund` for participant | success |

**Fuzz tests** (`contracts/test/fuzz/`): random valid sequences of (subscribe-like-pattern) `placeBet → settle → claim`. Assert invariants from Sections 5.2 and 5.3.

**Invariant tests** (`contracts/test/invariant/`):

- `sum(userStake[m][u][o]) over u, o == sum(outcomeStake[m])` always.
- `USDC.balanceOf(vault) >= sum across matches of (active pool + unclaimed payout)`.
- Monotone non-decreasing stake pre-settle.
- `claimed[m][u] XOR refunded[m][u]` (at most one true).
- Payout to any user ≤ `totalPool[m]`.

**Integration tests** (`contracts/test/integration/`): fork against compose anvil. Full lifecycle of two matches with multiple bettors per outcome. Assert payouts match parimutuel math within rounding.

**Coverage target:** ≥90% line, 100% on `placeBet`, `claim`, `refund`, `settleMarket`.

### 15.2 SDK (Vitest)

- `core`: EIP-712 payload snapshots (binding to a viem reference signer); viem decode round-trip on encoded calldata; `readMatch` / `readMarket` / `readUserPosition` against mocked RPC.
- `server`: Nanopayment client tries primary then fallback; telemetry reflects path; on both-failed input throws (does not silently skip).
- `react`: React Testing Library. `usePlaceBet` calls relay with correct payload (msw mock); `useAgent.spawn` calls control plane; `useMatches` reflects refetch.
- `agent`: each strategy unit-tested with a seeded RNG and a fixture pool; assert decisions are deterministic; assert `modelBased` calls `nanopayClient.pay` exactly once per match per tick window.

### 15.3 Services

- `oracle/`: fixture football-data.org responses → EIP-712 payload snapshots; signature roundtrip; resubmit safety (no double-write).
- `keeper/`: time-warped chain (anvil RPC), assert `closeMarket` within first tick after kickoff; assert `settleMarket` within first tick after ResultSubmitted.
- `relay/`: rate-limit boundaries; sponsor failure surfaces 4xx vs 5xx correctly.

### 15.4 End-to-end (Playwright)

Against the compose stack:

1. **Happy path human bet:** email signup → faucet → place bet → time-warp oracle → claim → balance updates.
2. **Happy path agent:** spawn agent → wait one tick → assert bet visible in `/agents` → time-warp → assert claim arrives.
3. **Empty winning pool:** craft a match where outcome 0 receives stakes but outcome 1 wins → settle → refund after `REFUND_AFTER`.
4. **Void:** owner calls `voidMatch` → refund flow succeeds for stakers.

### 15.5 CI (GitHub Actions)

- `lint`, `typecheck` across pnpm workspaces
- `forge test --gas-report` with coverage gate (≥90% on core contracts)
- `vitest run --coverage` for SDK and services
- `playwright test` against an ephemeral compose stack
- Cache: pnpm store + forge build artifacts

## 16. Out of scope / future work

- Mainnet deployment when Arc mainnet launches.
- Over/Under, BTTS, score-bucket markets.
- CPMM, orderbook, or fixed-odds market models.
- Live betting (mid-match).
- WC tournament data past 2026-07-13 (Semis, Final).
- Multi-tournament generalization (Euros, league play).
- User-uploaded agent strategies (sandboxed JS).
- Per-match keeper bounty market (decentralization).
- Multi-sig oracle, optimistic oracle with USDC bonds.
- Self-custody wallet path in demo (adapter exists, unused).
- Mobile app.
- Webhook notifications (settled, payout, low paymaster).
- Subgraph for fast leaderboard queries.
- Multi-provider model routing (per-agent `modelProviderWallet` is already configurable; routing logic is future).
- Onramp integration (Circle Web3 services).
- Refund or void via community vote.
- Pay-out streaming (instant payouts during the match — incompatible with parimutuel; would require restructuring).

## 17. Open questions

1. **Circle Nanopayments availability on Arc Testnet.** Confirm during oracle / agent scaffold. If unavailable, the documented `USDC.transferFrom` fallback is the live path and the demo must label it as such.
2. **CallFrom precompile address on Arc Testnet.** Documented in Arc EVM compatibility page; confirm at integration. If absent, fall back to EIP-7702 delegation.
3. **Permit2 dual-mode signature.** Whether one EIP-712 envelope can carry both `PermitTransferFrom` (one-shot first bet) and `AllowanceTransfer` (recurring) is a Permit2-spec question. For arc-pick humans, one signature is fine (single PermitTransferFrom). For agents, one AllowanceTransfer is fine. The dual-mode question only arises if we ever want a "spawn + first bet" combined flow — out of scope for MVP, noted.
4. **Agent gas funding.** Spec proposes agents pay own gas in USDC (Arc native). The agent runtime key is funded with ~0.5 USDC at spawn from the platform float. If gas spikes on Arc during build, revisit and route the agent through the paymaster.
5. **Football-data.org SLA.** Free tier with no contract. Demo risk if outage during WC. Mitigation: cache last-known schedule + manual override key on `voidMatch` and on registry updates.
6. **Oracle dispute path.** If football-data.org publishes a wrong score (rare but documented), owner has `setSigner` and `voidMatch`. The spec proposes adding an owner-only `Oracle.overrideResult(matchId, home, away)` for transparency; flagged as the cleanest path for MVP.
7. **Nanopayment denomination.** 0.001 USDC per inference is a guess. Tune based on Anthropic API actual per-call cost converted to USDC; the cap-per-session is the real safety mechanism.
8. **Agent runtime key custody.** Runtime EOA generated per spawn and held by agent service. Combined with the `authorizedAgent` gate on BetVault, the worst case if the service is compromised is that the attacker can spend (lose) the owner's Permit2-capped cap on bad bets — funds cannot be exfiltrated to an attacker wallet (they always go to BetVault). Owner has `deauthorizeAgent` as kill-switch. Acceptable for testnet; future-work options include multi-key authorization (e.g., owner + service co-signs each bet) and HSM-backed key custody.

## 18. References

- [Arc Network overview](https://docs.arc.io/arc-chain.md)
- [Arc system overview](https://docs.arc.io/arc/concepts/system-overview.md)
- [Arc stable fee design](https://docs.arc.io/arc/concepts/stable-fee-design.md)
- [Arc contract addresses](https://docs.arc.io/arc/references/contract-addresses.md)
- [Arc EVM compatibility (CallFrom precompile)](https://docs.arc.io/arc/references/evm-compatibility.md)
- [Permit2 spec](https://github.com/Uniswap/permit2)
- [Circle Modular Wallets](https://developers.circle.com/w3s/docs/modular-wallets)
- [Circle Nanopayments](https://developers.circle.com/) — confirm exact docs URL at integration
- [football-data.org WC 2026 endpoint](https://www.football-data.org/coverage)
- [Ignyte challenge brief — Track 4](https://app.ignyte.ae/)
- Sibling: `/Users/long/Code/arc/docs/superpowers/specs/2026-06-01-arc-paywall-design.md` — reusable patterns
