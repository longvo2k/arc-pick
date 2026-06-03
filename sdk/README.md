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
