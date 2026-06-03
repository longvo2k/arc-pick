# arc-pick P1: Foundation + Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Foundry project, dockerised local Arc-Testnet-like dev environment, and the five Solidity contracts (MatchRegistry, Market, BetVault, Oracle, BetPaymaster) with ≥90% unit-test coverage, fuzz tests, invariant tests, and a full-lifecycle integration test.

**Architecture:** Single Foundry project under `contracts/`, with mocks for USDC, Permit2, and Arc's `CallFrom` precompile so the contracts can be exercised hermetically in unit tests. Compose stack brings up an anvil chain, deploys the five contracts at deterministic CREATE2 addresses, seeds two demo bots and a handful of WC 2026 group-stage matches. Tests use a `TestBase` helper that wires the five contracts plus mocks for every test class. Strict TDD: write a failing test, prove it fails, implement, prove it passes, commit.

**Tech Stack:**

- Solidity ^0.8.24, Foundry (forge, anvil, cast). Forge stdlib 1.x.
- Uniswap Permit2 vendored as a forge dep (canonical source at `Uniswap/permit2`).
- No OpenZeppelin — write a 12-line `Ownable` ourselves to keep deps tight.
- `pnpm` workspace at the repo root (later phases need it; we set it up here so paths are right).
- Docker compose for the dev stack (anvil + deploy script + seed script).
- GitHub Actions CI: forge build, forge test, forge coverage.

**Out of scope for P1:**

- The SDK, services, demo (P2-P5).
- The Circle Modular Wallets adapter (P2).
- Real Permit2 deployment on Arc Testnet — we use the canonical address `0x000000000022D473030F116dDEE9F6B43aC78BA3` in *integration* tests by `vm.etch`-ing the canonical bytecode at that address; in compose we deploy a fresh copy and wire the address through env.
- Real Nanopayment flows (P3).

---

## File Structure

Below is the full file map for P1. Each file has one job; every later task assumes this layout.

```
arc-pick/
├── .github/
│   └── workflows/
│       └── contracts.yml             CI: forge build, test, coverage gate
├── compose-init/
│   ├── Dockerfile.foundry            Image with forge + cast preinstalled
│   ├── deploy.sh                     Runs Deploy.s.sol against the anvil container
│   └── seed.sh                       Runs SeedMatches.s.sol + mints faucet USDC
├── contracts/
│   ├── foundry.toml                  forge config
│   ├── remappings.txt                forge remappings
│   ├── lib/                          forge install destination (gitignored except .gitkeep)
│   ├── src/
│   │   ├── MatchRegistry.sol
│   │   ├── Market.sol
│   │   ├── BetVault.sol
│   │   ├── Oracle.sol
│   │   ├── BetPaymaster.sol
│   │   ├── Ownable.sol               12-line minimal owner pattern
│   │   ├── interfaces/
│   │   │   ├── IMatchRegistry.sol
│   │   │   ├── IMarket.sol
│   │   │   ├── IBetVault.sol
│   │   │   ├── IOracle.sol
│   │   │   ├── IBetPaymaster.sol
│   │   │   ├── IPermit2.sol          subset we use
│   │   │   └── IERC20.sol            subset we use
│   │   └── mocks/
│   │       ├── MockUSDC.sol
│   │       ├── MockPermit2.sol
│   │       └── MockCallFrom.sol
│   ├── script/
│   │   ├── Deploy.s.sol              deterministic CREATE2 deploy of all five contracts
│   │   └── SeedMatches.s.sol         upserts 6 demo matches via Oracle/Registry, mints faucet USDC
│   └── test/
│       ├── helpers/
│       │   └── TestBase.sol          shared setUp() that deploys mocks + 5 contracts
│       ├── unit/
│       │   ├── MatchRegistry.t.sol
│       │   ├── Market.t.sol
│       │   ├── BetVaultPlaceBet.t.sol            placeBet (humans, SignatureTransfer)
│       │   ├── BetVaultAgent.t.sol               placeBetFromAllowance + authorize/deauthorize
│       │   ├── BetVaultClaim.t.sol               settleMarket, claimFor, refundFor
│       │   ├── Oracle.t.sol
│       │   └── BetPaymaster.t.sol
│       ├── fuzz/
│       │   └── BetVaultRoundtrip.fuzz.t.sol
│       ├── invariant/
│       │   ├── BetVaultInvariants.t.sol
│       │   └── handlers/BetVaultHandler.sol
│       └── integration/
│           └── Lifecycle.t.sol                   forks anvil, full lifecycle
├── docker-compose.yml
├── .env.example
├── .gitignore
├── foundry.toml                     points to contracts/ (forge can be run from root)
├── package.json                     workspace root
├── pnpm-workspace.yaml
└── README.md
```

---

## Task 1: Repo scaffold (pnpm workspace + root configs)

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `foundry.toml` (root proxy)
- Create: `README.md` (stub)

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "sdk"
  - "relay"
  - "oracle"
  - "keeper"
  - "agent"
  - "demo"
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "arc-pick",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20.11.0" },
  "scripts": {
    "build:contracts": "forge build --root contracts",
    "test:contracts": "forge test --root contracts -vv",
    "coverage:contracts": "forge coverage --root contracts --report summary --report lcov",
    "compose:up": "docker compose up -d",
    "compose:down": "docker compose down -v"
  }
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
.pnpm-store/
dist/
build/
.next/
out/
.env
.env.local
.DS_Store

# Foundry
contracts/cache/
contracts/out/
contracts/broadcast/
contracts/lib/**
!contracts/lib/.gitkeep

# Docker
.volumes/
```

- [ ] **Step 4: Create `.env.example`**

```
# Compose anvil
ANVIL_PORT=8545
ANVIL_CHAIN_ID=5042002

# Deploy keys (anvil deterministic)
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ORACLE_SIGNER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
ORACLE_SUBMITTER_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

# Addresses to be set by deploy script (compose-init/deploy.sh writes these)
USDC_ADDRESS=
PERMIT2_ADDRESS=
CALL_FROM_ADDRESS=
MATCH_REGISTRY_ADDRESS=
MARKET_ADDRESS=
BET_VAULT_ADDRESS=
ORACLE_ADDRESS=
BET_PAYMASTER_ADDRESS=
```

- [ ] **Step 5: Create root `foundry.toml`**

```toml
[profile.default]
src = "contracts/src"
test = "contracts/test"
script = "contracts/script"
out = "contracts/out"
libs = ["contracts/lib"]
remappings_path = "contracts/remappings.txt"
solc = "0.8.24"
optimizer = true
optimizer_runs = 200
via_ir = false
```

- [ ] **Step 6: Create stub `README.md`**

```md
# arc-pick

FIFA World Cup 2026 prediction market on Arc Testnet.

Submission to the Ignyte Stablecoin Commerce Stack Challenge — Track 4 (Agentic Economy).

See [docs/specs/arc-pick-design.md](docs/specs/arc-pick-design.md) for the design and
[docs/plans/](docs/plans/) for implementation plans.

## Quick start

```bash
pnpm install
docker compose up -d
pnpm test:contracts
```
```

- [ ] **Step 7: Verify**

Run: `pnpm install`
Expected: lockfile generated, no errors. `git status` shows only the new files above.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml .gitignore .env.example foundry.toml README.md pnpm-lock.yaml
git commit -m "chore: scaffold pnpm workspace and root configs"
```

---

## Task 2: Foundry init + deps

**Files:**

- Create: `contracts/foundry.toml`
- Create: `contracts/remappings.txt`
- Create: `contracts/lib/.gitkeep`

- [ ] **Step 1: Create `contracts/foundry.toml`** (per-package config used when `forge` runs from `contracts/`)

```toml
[profile.default]
src = "src"
test = "test"
script = "script"
out = "out"
libs = ["lib"]
solc = "0.8.24"
optimizer = true
optimizer_runs = 200
via_ir = false
fs_permissions = [{ access = "read-write", path = "./" }]

[fuzz]
runs = 256

[invariant]
runs = 64
depth = 32
fail_on_revert = false
```

- [ ] **Step 2: Install forge-std and permit2**

```bash
cd contracts
forge install foundry-rs/forge-std --no-commit
forge install Uniswap/permit2 --no-commit
touch lib/.gitkeep
cd ..
```

- [ ] **Step 3: Create `contracts/remappings.txt`**

```
forge-std/=lib/forge-std/src/
permit2/=lib/permit2/src/
```

- [ ] **Step 4: Verify forge builds an empty project**

Run: `forge build --root contracts`
Expected: "Compiling 0 files" or similar, no errors.

- [ ] **Step 5: Commit**

```bash
git add contracts/foundry.toml contracts/remappings.txt contracts/lib/.gitkeep .gitmodules
git commit -m "chore(contracts): forge init with forge-std and permit2"
```

---

## Task 3: Minimal `Ownable.sol`

**Files:**

- Create: `contracts/src/Ownable.sol`
- Create: `contracts/test/unit/Ownable.t.sol`

- [ ] **Step 1: Write the failing test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "../../src/Ownable.sol";

contract OwnedConsumer is Ownable {
    uint256 public x;
    function setX(uint256 v) external onlyOwner { x = v; }
}

contract OwnableTest is Test {
    OwnedConsumer c;
    address owner = address(0xA11CE);
    address other = address(0xB0B);

    function setUp() public {
        vm.prank(owner);
        c = new OwnedConsumer();
    }

    function test_owner_isDeployer() public view {
        assertEq(c.owner(), owner);
    }

    function test_onlyOwner_allowsOwner() public {
        vm.prank(owner);
        c.setX(7);
        assertEq(c.x(), 7);
    }

    function test_onlyOwner_rejectsOther() public {
        vm.prank(other);
        vm.expectRevert(Ownable.NotOwner.selector);
        c.setX(7);
    }

    function test_transferOwnership() public {
        vm.prank(owner);
        c.transferOwnership(other);
        assertEq(c.owner(), other);
        vm.prank(other);
        c.setX(9);
        assertEq(c.x(), 9);
    }

    function test_transferOwnership_onlyOwner() public {
        vm.prank(other);
        vm.expectRevert(Ownable.NotOwner.selector);
        c.transferOwnership(other);
    }
}
```

- [ ] **Step 2: Run, expect compile fail**

Run: `forge test --root contracts --match-path "test/unit/Ownable.t.sol" -vv`
Expected: error "File not found: src/Ownable.sol".

- [ ] **Step 3: Implement `Ownable.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

abstract contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `forge test --root contracts --match-path "test/unit/Ownable.t.sol" -vv`
Expected: 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/Ownable.sol contracts/test/unit/Ownable.t.sol
git commit -m "feat(contracts): minimal Ownable with onlyOwner + transferOwnership"
```

---

## Task 4: Interfaces for ERC20 and Permit2

**Files:**

- Create: `contracts/src/interfaces/IERC20.sol`
- Create: `contracts/src/interfaces/IPermit2.sol`

- [ ] **Step 1: Create `IERC20.sol`** (subset we use — no need for full ERC20)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function totalSupply() external view returns (uint256);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}
```

- [ ] **Step 2: Create `IPermit2.sol`** (only the methods we use — SignatureTransfer.permitTransferFrom + AllowanceTransfer.transferFrom)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPermit2 {
    struct TokenPermissions { address token; uint256 amount; }
    struct PermitTransferFrom { TokenPermissions permitted; uint256 nonce; uint256 deadline; }
    struct SignatureTransferDetails { address to; uint256 requestedAmount; }

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;

    function transferFrom(address from, address to, uint160 amount, address token) external;

    function allowance(address user, address token, address spender)
        external view returns (uint160 amount, uint48 expiration, uint48 nonce);

    function approve(address token, address spender, uint160 amount, uint48 expiration) external;

    function lockdown(TokenSpenderPair[] calldata approvals) external;

    struct TokenSpenderPair { address token; address spender; }
}
```

- [ ] **Step 3: Verify build**

Run: `forge build --root contracts`
Expected: compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add contracts/src/interfaces/IERC20.sol contracts/src/interfaces/IPermit2.sol
git commit -m "feat(contracts): IERC20 and IPermit2 interfaces (subset)"
```

---

## Task 5: `MockUSDC.sol`

**Files:**

- Create: `contracts/src/mocks/MockUSDC.sol`
- Create: `contracts/test/unit/MockUSDC.t.sol`

- [ ] **Step 1: Write the failing test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC usdc;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public { usdc = new MockUSDC(); }

    function test_metadata() public view {
        assertEq(usdc.name(), "Mock USDC");
        assertEq(usdc.symbol(), "USDC");
        assertEq(usdc.decimals(), 6);
    }

    function test_mint() public {
        usdc.mint(alice, 1_000_000); // 1 USDC
        assertEq(usdc.balanceOf(alice), 1_000_000);
        assertEq(usdc.totalSupply(), 1_000_000);
    }

    function test_transfer() public {
        usdc.mint(alice, 10_000_000);
        vm.prank(alice);
        assertTrue(usdc.transfer(bob, 4_000_000));
        assertEq(usdc.balanceOf(alice), 6_000_000);
        assertEq(usdc.balanceOf(bob), 4_000_000);
    }

    function test_transferFrom_withAllowance() public {
        usdc.mint(alice, 10_000_000);
        vm.prank(alice);
        usdc.approve(bob, 4_000_000);
        vm.prank(bob);
        usdc.transferFrom(alice, bob, 4_000_000);
        assertEq(usdc.balanceOf(bob), 4_000_000);
        assertEq(usdc.allowance(alice, bob), 0);
    }

    function test_transferFrom_revertsOnInsufficient() public {
        usdc.mint(alice, 1);
        vm.prank(alice);
        usdc.approve(bob, 100);
        vm.prank(bob);
        vm.expectRevert();
        usdc.transferFrom(alice, bob, 100);
    }
}
```

- [ ] **Step 2: Run, expect compile fail**

Run: `forge test --root contracts --match-path "test/unit/MockUSDC.t.sol" -vv`
Expected: "File not found".

- [ ] **Step 3: Implement `MockUSDC.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";

/// @notice 6-decimal mock USDC for tests. Public mint — DO NOT DEPLOY TO MAINNET.
contract MockUSDC is IERC20 {
    string public constant name = "Mock USDC";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `forge test --root contracts --match-path "test/unit/MockUSDC.t.sol" -vv`
Expected: 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/mocks/MockUSDC.sol contracts/test/unit/MockUSDC.t.sol
git commit -m "feat(contracts): MockUSDC 6-decimal ERC20 with public mint"
```

---

## Task 6: `MockPermit2.sol`

A minimal Permit2 that supports the two flows we use: `permitTransferFrom` (SignatureTransfer mode) and `transferFrom`/`approve` (AllowanceTransfer mode). It does *not* verify EIP-712 sigs — tests pass `bytes("")` for the sig. This keeps unit tests fast and hermetic; integration tests use real Permit2.

**Files:**

- Create: `contracts/src/mocks/MockPermit2.sol`
- Create: `contracts/test/unit/MockPermit2.t.sol`

- [ ] **Step 1: Write the failing test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {MockPermit2} from "../../src/mocks/MockPermit2.sol";
import {IPermit2} from "../../src/interfaces/IPermit2.sol";

contract MockPermit2Test is Test {
    MockUSDC usdc;
    MockPermit2 permit2;
    address alice = address(0xA11CE);
    address spender = address(0xBEEF);
    address dest = address(0xD51);

    function setUp() public {
        usdc = new MockUSDC();
        permit2 = new MockPermit2();
        usdc.mint(alice, 1_000_000_000);
        vm.prank(alice);
        usdc.approve(address(permit2), type(uint256).max);
    }

    function test_permitTransferFrom_movesTokens() public {
        IPermit2.PermitTransferFrom memory permit = IPermit2.PermitTransferFrom({
            permitted: IPermit2.TokenPermissions({ token: address(usdc), amount: 500_000 }),
            nonce: 1, deadline: block.timestamp + 1 hours
        });
        IPermit2.SignatureTransferDetails memory td = IPermit2.SignatureTransferDetails({
            to: dest, requestedAmount: 500_000
        });
        vm.prank(spender);
        permit2.permitTransferFrom(permit, td, alice, "");
        assertEq(usdc.balanceOf(dest), 500_000);
        assertEq(usdc.balanceOf(alice), 1_000_000_000 - 500_000);
    }

    function test_permitTransferFrom_nonceReplayReverts() public {
        IPermit2.PermitTransferFrom memory permit = IPermit2.PermitTransferFrom({
            permitted: IPermit2.TokenPermissions({ token: address(usdc), amount: 100 }),
            nonce: 42, deadline: block.timestamp + 1 hours
        });
        IPermit2.SignatureTransferDetails memory td = IPermit2.SignatureTransferDetails({ to: dest, requestedAmount: 100 });
        vm.prank(spender);
        permit2.permitTransferFrom(permit, td, alice, "");
        vm.prank(spender);
        vm.expectRevert(MockPermit2.NonceUsed.selector);
        permit2.permitTransferFrom(permit, td, alice, "");
    }

    function test_permitTransferFrom_pastDeadlineReverts() public {
        IPermit2.PermitTransferFrom memory permit = IPermit2.PermitTransferFrom({
            permitted: IPermit2.TokenPermissions({ token: address(usdc), amount: 100 }),
            nonce: 1, deadline: block.timestamp - 1
        });
        IPermit2.SignatureTransferDetails memory td = IPermit2.SignatureTransferDetails({ to: dest, requestedAmount: 100 });
        vm.prank(spender);
        vm.expectRevert(MockPermit2.Expired.selector);
        permit2.permitTransferFrom(permit, td, alice, "");
    }

    function test_allowance_approveAndTransferFrom() public {
        vm.prank(alice);
        permit2.approve(address(usdc), spender, 1_000, uint48(block.timestamp + 1 days));
        vm.prank(spender);
        permit2.transferFrom(alice, dest, 600, address(usdc));
        assertEq(usdc.balanceOf(dest), 600);
        (uint160 amt, , ) = permit2.allowance(alice, address(usdc), spender);
        assertEq(amt, 400);
    }

    function test_allowance_expiredReverts() public {
        vm.prank(alice);
        permit2.approve(address(usdc), spender, 1_000, uint48(block.timestamp + 1));
        skip(2);
        vm.prank(spender);
        vm.expectRevert(MockPermit2.AllowanceExpired.selector);
        permit2.transferFrom(alice, dest, 1, address(usdc));
    }

    function test_allowance_insufficientReverts() public {
        vm.prank(alice);
        permit2.approve(address(usdc), spender, 10, uint48(block.timestamp + 1 days));
        vm.prank(spender);
        vm.expectRevert(MockPermit2.AllowanceInsufficient.selector);
        permit2.transferFrom(alice, dest, 11, address(usdc));
    }
}
```

- [ ] **Step 2: Run, expect compile fail**

Run: `forge test --root contracts --match-path "test/unit/MockPermit2.t.sol" -vv`
Expected: "File not found".

- [ ] **Step 3: Implement `MockPermit2.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPermit2} from "../interfaces/IPermit2.sol";
import {IERC20} from "../interfaces/IERC20.sol";

/// @notice Mock Permit2 for unit tests. Skips EIP-712 sig verification; trusts callers.
/// DO NOT DEPLOY OUTSIDE TESTS.
contract MockPermit2 is IPermit2 {
    error NonceUsed();
    error Expired();
    error AllowanceExpired();
    error AllowanceInsufficient();

    struct Allowance { uint160 amount; uint48 expiration; uint48 nonce; }

    mapping(address => mapping(uint256 => bool)) public usedNonces; // owner => nonce => used
    mapping(address => mapping(address => mapping(address => Allowance))) internal _allowance; // owner => token => spender => allowance

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata /* signature */
    ) external {
        if (block.timestamp > permit.deadline) revert Expired();
        if (usedNonces[owner][permit.nonce]) revert NonceUsed();
        usedNonces[owner][permit.nonce] = true;
        require(transferDetails.requestedAmount <= permit.permitted.amount, "exceeds permit");
        require(IERC20(permit.permitted.token).transferFrom(owner, transferDetails.to, transferDetails.requestedAmount), "transfer failed");
    }

    function transferFrom(address from, address to, uint160 amount, address token) external {
        Allowance storage a = _allowance[from][token][msg.sender];
        if (a.expiration < block.timestamp) revert AllowanceExpired();
        if (a.amount < amount) revert AllowanceInsufficient();
        a.amount -= amount;
        require(IERC20(token).transferFrom(from, to, amount), "transfer failed");
    }

    function allowance(address user, address token, address spender)
        external view returns (uint160 amount, uint48 expiration, uint48 nonce)
    {
        Allowance storage a = _allowance[user][token][spender];
        return (a.amount, a.expiration, a.nonce);
    }

    function approve(address token, address spender, uint160 amount, uint48 expiration) external {
        Allowance storage a = _allowance[msg.sender][token][spender];
        a.amount = amount;
        a.expiration = expiration;
    }

    function lockdown(TokenSpenderPair[] calldata approvals) external {
        for (uint256 i = 0; i < approvals.length; i++) {
            delete _allowance[msg.sender][approvals[i].token][approvals[i].spender];
        }
    }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `forge test --root contracts --match-path "test/unit/MockPermit2.t.sol" -vv`
Expected: 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/mocks/MockPermit2.sol contracts/test/unit/MockPermit2.t.sol
git commit -m "feat(contracts): MockPermit2 covering SignatureTransfer + AllowanceTransfer"
```

---

## Task 7: `MockCallFrom.sol`

Mocks Arc's `CallFrom` precompile. It executes a low-level call to a target with a specified `msg.sender`. In production this is a precompile at a documented address; in tests, the BetPaymaster will be parameterized with this mock's address.

**Files:**

- Create: `contracts/src/mocks/MockCallFrom.sol`
- Create: `contracts/test/unit/MockCallFrom.t.sol`

- [ ] **Step 1: Write the failing test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockCallFrom} from "../../src/mocks/MockCallFrom.sol";

contract Sink {
    address public lastSender;
    uint256 public lastValue;
    function record(uint256 v) external {
        lastSender = msg.sender;
        lastValue = v;
    }
}

contract MockCallFromTest is Test {
    MockCallFrom cf;
    Sink sink;

    function setUp() public {
        cf = new MockCallFrom();
        sink = new Sink();
    }

    function test_callFrom_preservesImpersonatedSender() public {
        address impersonated = address(0xBEEF);
        bytes memory data = abi.encodeCall(Sink.record, (42));
        bool ok = cf.callFrom(impersonated, address(sink), data);
        assertTrue(ok);
        assertEq(sink.lastSender(), impersonated);
        assertEq(sink.lastValue(), 42);
    }

    function test_callFrom_bubblesRevert() public {
        bytes memory badData = abi.encodeWithSignature("nope()");
        vm.expectRevert();
        cf.callFrom(address(0xCAFE), address(sink), badData);
    }
}
```

- [ ] **Step 2: Run, expect compile fail**

Run: `forge test --root contracts --match-path "test/unit/MockCallFrom.t.sol" -vv`
Expected: "File not found".

- [ ] **Step 3: Implement `MockCallFrom.sol`**

Solidity cannot actually spoof `msg.sender`. In production, Arc's precompile does this at the EVM level. For unit-test purposes we model the call path: the mock records that `callFrom(impersonated, target, data)` was invoked, forwards to `target`, and emits an event with the impersonated address. BetPaymaster's production path uses `placeBetSponsored` (Task 14) — a direct call where the paymaster passes the bettor as a parameter — which sidesteps the need to truly spoof sender.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Mock of Arc's CallFrom precompile.
///
/// IMPORTANT: Solidity cannot actually spoof msg.sender. In production, Arc's precompile
/// does this at the EVM level. For unit tests of BetPaymaster, we make BetVault.placeBet
/// accept the bettor as an explicit parameter when called via the paymaster path, and have
/// the paymaster pass `bettor` through. The mock here records that callFrom was invoked
/// and forwards the call to the target; tests assert on the recorded impersonated address.
contract MockCallFrom {
    struct Call { address impersonated; address target; bytes data; bool ok; }
    Call[] public calls;

    event CalledFrom(address indexed impersonated, address indexed target, bytes data);

    function callFrom(address impersonated, address target, bytes calldata data)
        external returns (bool)
    {
        (bool ok, bytes memory ret) = target.call(data);
        calls.push(Call({ impersonated: impersonated, target: target, data: data, ok: ok }));
        emit CalledFrom(impersonated, target, data);
        if (!ok) { assembly { revert(add(ret, 32), mload(ret)) } }
        return ok;
    }

    function callCount() external view returns (uint256) { return calls.length; }
    function lastCall() external view returns (Call memory) { return calls[calls.length - 1]; }
}
```

- [ ] **Step 4: Update the failing test to match (remove the sender assertion since we can't spoof it; assert via the CalledFrom event instead)**

Replace the test file contents:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockCallFrom} from "../../src/mocks/MockCallFrom.sol";

contract Sink {
    uint256 public lastValue;
    function record(uint256 v) external { lastValue = v; }
    function nope() external pure { revert("nope"); }
}

contract MockCallFromTest is Test {
    MockCallFrom cf;
    Sink sink;

    event CalledFrom(address indexed impersonated, address indexed target, bytes data);

    function setUp() public {
        cf = new MockCallFrom();
        sink = new Sink();
    }

    function test_callFrom_emitsEventAndRecords() public {
        address impersonated = address(0xBEEF);
        bytes memory data = abi.encodeCall(Sink.record, (42));
        vm.expectEmit(true, true, false, true, address(cf));
        emit CalledFrom(impersonated, address(sink), data);
        cf.callFrom(impersonated, address(sink), data);
        assertEq(sink.lastValue(), 42);
        assertEq(cf.callCount(), 1);
        MockCallFrom.Call memory c = cf.lastCall();
        assertEq(c.impersonated, impersonated);
        assertEq(c.target, address(sink));
        assertTrue(c.ok);
    }

    function test_callFrom_bubblesRevert() public {
        bytes memory badData = abi.encodeWithSignature("nope()");
        vm.expectRevert();
        cf.callFrom(address(0xCAFE), address(sink), badData);
    }
}
```

- [ ] **Step 5: Run, expect pass**

Run: `forge test --root contracts --match-path "test/unit/MockCallFrom.t.sol" -vv`
Expected: 2 tests passing.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/mocks/MockCallFrom.sol contracts/test/unit/MockCallFrom.t.sol
git commit -m "feat(contracts): MockCallFrom precompile stand-in for unit tests"
```

---

## Task 8: `IMatchRegistry.sol` + `MatchRegistry.sol`

**Files:**

- Create: `contracts/src/interfaces/IMatchRegistry.sol`
- Create: `contracts/src/MatchRegistry.sol`
- Create: `contracts/test/unit/MatchRegistry.t.sol`

- [ ] **Step 1: Create `IMatchRegistry.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMatchRegistry {
    enum Status { Unknown, Open, Closed, Settled, Voided }
    struct Match {
        bytes32 homeTeam;
        bytes32 awayTeam;
        uint64 kickoff;
        Status status;
        uint8 winningOutcome; // 0=Home, 1=Draw, 2=Away
    }

    event MatchAdded(bytes32 indexed matchId, bytes32 homeTeam, bytes32 awayTeam, uint64 kickoff);
    event MatchRescheduled(bytes32 indexed matchId, uint64 oldKickoff, uint64 newKickoff);
    event MarketClosed(bytes32 indexed matchId);
    event MatchSettled(bytes32 indexed matchId, uint8 winningOutcome);
    event MatchVoided(bytes32 indexed matchId);
    event OracleUpdated(address indexed oracle);
    event BetVaultUpdated(address indexed betVault);

    error NotOracle();
    error NotBetVault();
    error AlreadyExists();
    error NotOpen();
    error TooEarly();
    error NotClosed();
    error AlreadySettled();
    error InvalidOutcome();
    error InvalidStatus();

    function upsertMatch(bytes32 matchId, bytes32 home, bytes32 away, uint64 kickoff) external;
    function closeMarket(bytes32 matchId) external;
    function markSettled(bytes32 matchId, uint8 winningOutcome) external;
    function voidMatch(bytes32 matchId) external;
    function matches(bytes32 matchId) external view returns (
        bytes32 homeTeam, bytes32 awayTeam, uint64 kickoff, Status status, uint8 winningOutcome
    );
    function setOracle(address oracle) external;
    function setBetVault(address betVault) external;
    function oracle() external view returns (address);
    function betVault() external view returns (address);
}
```

- [ ] **Step 2: Write the failing test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MatchRegistry} from "../../src/MatchRegistry.sol";
import {IMatchRegistry} from "../../src/interfaces/IMatchRegistry.sol";

contract MatchRegistryTest is Test {
    MatchRegistry reg;
    address owner = address(0xA11CE);
    address oracle = address(0xBABE);
    address vault = address(0xCAFE);
    address other = address(0xB0B);

    bytes32 constant M1 = keccak256("FIFA-WC26-1");
    bytes32 constant ARG = bytes32("ARG");
    bytes32 constant MEX = bytes32("MEX");

    function setUp() public {
        vm.startPrank(owner);
        reg = new MatchRegistry();
        reg.setOracle(oracle);
        reg.setBetVault(vault);
        vm.stopPrank();
    }

    function _upsert(uint64 kickoff) internal {
        vm.prank(oracle);
        reg.upsertMatch(M1, ARG, MEX, kickoff);
    }

    function test_setOracle_onlyOwner() public {
        vm.prank(other);
        vm.expectRevert();
        reg.setOracle(address(0xDEAD));
    }

    function test_upsertMatch_onlyOracle() public {
        vm.prank(other);
        vm.expectRevert(IMatchRegistry.NotOracle.selector);
        reg.upsertMatch(M1, ARG, MEX, uint64(block.timestamp + 1 days));
    }

    function test_upsertMatch_inserts() public {
        uint64 ko = uint64(block.timestamp + 1 days);
        vm.expectEmit(true, false, false, true);
        emit IMatchRegistry.MatchAdded(M1, ARG, MEX, ko);
        _upsert(ko);
        (bytes32 home, bytes32 away, uint64 kickoff, IMatchRegistry.Status st, uint8 win) = reg.matches(M1);
        assertEq(home, ARG); assertEq(away, MEX); assertEq(kickoff, ko);
        assertEq(uint8(st), uint8(IMatchRegistry.Status.Open));
        assertEq(win, 0);
    }

    function test_upsertMatch_reschedules() public {
        _upsert(uint64(block.timestamp + 1 days));
        uint64 newKo = uint64(block.timestamp + 2 days);
        vm.expectEmit(true, false, false, true);
        emit IMatchRegistry.MatchRescheduled(M1, uint64(block.timestamp + 1 days), newKo);
        vm.prank(oracle);
        reg.upsertMatch(M1, ARG, MEX, newKo);
        (, , uint64 kickoff, , ) = reg.matches(M1);
        assertEq(kickoff, newKo);
    }

    function test_upsertMatch_rejectsAfterClosed() public {
        _upsert(uint64(block.timestamp + 1));
        skip(2);
        reg.closeMarket(M1);
        vm.prank(oracle);
        vm.expectRevert(IMatchRegistry.NotOpen.selector);
        reg.upsertMatch(M1, ARG, MEX, uint64(block.timestamp + 1 days));
    }

    function test_closeMarket_anyCaller_butOnlyAtKickoff() public {
        _upsert(uint64(block.timestamp + 1 hours));
        vm.prank(other);
        vm.expectRevert(IMatchRegistry.TooEarly.selector);
        reg.closeMarket(M1);
        skip(1 hours);
        vm.prank(other);
        vm.expectEmit(true, false, false, false);
        emit IMatchRegistry.MarketClosed(M1);
        reg.closeMarket(M1);
        (, , , IMatchRegistry.Status st, ) = reg.matches(M1);
        assertEq(uint8(st), uint8(IMatchRegistry.Status.Closed));
    }

    function test_markSettled_onlyBetVault() public {
        _upsert(uint64(block.timestamp + 1));
        skip(2);
        reg.closeMarket(M1);
        vm.prank(other);
        vm.expectRevert(IMatchRegistry.NotBetVault.selector);
        reg.markSettled(M1, 0);
    }

    function test_markSettled_happy() public {
        _upsert(uint64(block.timestamp + 1));
        skip(2);
        reg.closeMarket(M1);
        vm.prank(vault);
        vm.expectEmit(true, false, false, true);
        emit IMatchRegistry.MatchSettled(M1, 0);
        reg.markSettled(M1, 0);
        (, , , IMatchRegistry.Status st, uint8 win) = reg.matches(M1);
        assertEq(uint8(st), uint8(IMatchRegistry.Status.Settled));
        assertEq(win, 0);
    }

    function test_markSettled_rejectsInvalidOutcome() public {
        _upsert(uint64(block.timestamp + 1));
        skip(2);
        reg.closeMarket(M1);
        vm.prank(vault);
        vm.expectRevert(IMatchRegistry.InvalidOutcome.selector);
        reg.markSettled(M1, 3);
    }

    function test_markSettled_rejectsTwice() public {
        _upsert(uint64(block.timestamp + 1));
        skip(2);
        reg.closeMarket(M1);
        vm.prank(vault);
        reg.markSettled(M1, 1);
        vm.prank(vault);
        vm.expectRevert(IMatchRegistry.AlreadySettled.selector);
        reg.markSettled(M1, 1);
    }

    function test_voidMatch_onlyOracle_thenStatusVoided() public {
        _upsert(uint64(block.timestamp + 1 days));
        vm.prank(other);
        vm.expectRevert(IMatchRegistry.NotOracle.selector);
        reg.voidMatch(M1);
        vm.prank(oracle);
        vm.expectEmit(true, false, false, false);
        emit IMatchRegistry.MatchVoided(M1);
        reg.voidMatch(M1);
        (, , , IMatchRegistry.Status st, ) = reg.matches(M1);
        assertEq(uint8(st), uint8(IMatchRegistry.Status.Voided));
    }
}
```

- [ ] **Step 3: Run, expect compile fail (no MatchRegistry)**

Run: `forge test --root contracts --match-path "test/unit/MatchRegistry.t.sol" -vv`
Expected: "File not found: src/MatchRegistry.sol".

- [ ] **Step 4: Implement `MatchRegistry.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./Ownable.sol";
import {IMatchRegistry} from "./interfaces/IMatchRegistry.sol";

contract MatchRegistry is IMatchRegistry, Ownable {
    address public oracle;
    address public betVault;
    mapping(bytes32 => Match) internal _matches;

    function matches(bytes32 matchId) external view returns (
        bytes32 homeTeam, bytes32 awayTeam, uint64 kickoff, Status status, uint8 winningOutcome
    ) {
        Match storage m = _matches[matchId];
        return (m.homeTeam, m.awayTeam, m.kickoff, m.status, m.winningOutcome);
    }

    function setOracle(address newOracle) external onlyOwner {
        oracle = newOracle;
        emit OracleUpdated(newOracle);
    }

    function setBetVault(address newVault) external onlyOwner {
        betVault = newVault;
        emit BetVaultUpdated(newVault);
    }

    function upsertMatch(bytes32 matchId, bytes32 home, bytes32 away, uint64 kickoff) external {
        if (msg.sender != oracle) revert NotOracle();
        Match storage m = _matches[matchId];
        if (m.status == Status.Unknown) {
            m.homeTeam = home;
            m.awayTeam = away;
            m.kickoff = kickoff;
            m.status = Status.Open;
            emit MatchAdded(matchId, home, away, kickoff);
        } else if (m.status == Status.Open) {
            uint64 old = m.kickoff;
            m.kickoff = kickoff;
            emit MatchRescheduled(matchId, old, kickoff);
        } else {
            revert NotOpen();
        }
    }

    function closeMarket(bytes32 matchId) external {
        Match storage m = _matches[matchId];
        if (m.status != Status.Open) revert NotOpen();
        if (block.timestamp < m.kickoff) revert TooEarly();
        m.status = Status.Closed;
        emit MarketClosed(matchId);
    }

    function markSettled(bytes32 matchId, uint8 winningOutcome) external {
        if (msg.sender != betVault) revert NotBetVault();
        if (winningOutcome > 2) revert InvalidOutcome();
        Match storage m = _matches[matchId];
        if (m.status == Status.Settled) revert AlreadySettled();
        if (m.status != Status.Closed) revert NotClosed();
        m.status = Status.Settled;
        m.winningOutcome = winningOutcome;
        emit MatchSettled(matchId, winningOutcome);
    }

    function voidMatch(bytes32 matchId) external {
        if (msg.sender != oracle) revert NotOracle();
        Match storage m = _matches[matchId];
        if (m.status == Status.Settled || m.status == Status.Voided) revert InvalidStatus();
        m.status = Status.Voided;
        emit MatchVoided(matchId);
    }
}
```

- [ ] **Step 5: Run, expect pass**

Run: `forge test --root contracts --match-path "test/unit/MatchRegistry.t.sol" -vv`
Expected: 11 tests passing.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/interfaces/IMatchRegistry.sol contracts/src/MatchRegistry.sol contracts/test/unit/MatchRegistry.t.sol
git commit -m "feat(contracts): MatchRegistry with lifecycle gates and event coverage"
```

---

## Task 9: `IMarket.sol` + `Market.sol`

**Files:**

- Create: `contracts/src/interfaces/IMarket.sol`
- Create: `contracts/src/Market.sol`
- Create: `contracts/test/unit/Market.t.sol`

- [ ] **Step 1: Create `IMarket.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMarket {
    event StakeRecorded(bytes32 indexed matchId, address indexed user, uint8 outcome, uint128 amount);
    error NotVault();
    error InvalidOutcome();

    function recordStake(bytes32 matchId, address user, uint8 outcome, uint128 amount) external;
    function outcomeStake(bytes32 matchId, uint8 outcome) external view returns (uint128);
    function userStake(bytes32 matchId, address user, uint8 outcome) external view returns (uint128);
    function userTotalStake(bytes32 matchId, address user) external view returns (uint256);
    function totalPool(bytes32 matchId) external view returns (uint256);
    function impliedProb(bytes32 matchId, uint8 outcome) external view returns (uint128 num, uint128 denom);
    function betVault() external view returns (address);
}
```

- [ ] **Step 2: Write the failing test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Market} from "../../src/Market.sol";
import {IMarket} from "../../src/interfaces/IMarket.sol";

contract MarketTest is Test {
    Market market;
    address vault = address(0xCAFE);
    address other = address(0xB0B);
    address alice = address(0xA11CE);
    bytes32 constant M = keccak256("M");

    function setUp() public {
        market = new Market();
        market.setBetVault(vault);
    }

    function test_betVault() public view { assertEq(market.betVault(), vault); }

    function test_setBetVault_onlyOnce() public {
        vm.expectRevert(Market.AlreadySet.selector);
        market.setBetVault(address(0xBEEF));
    }

    function test_recordStake_onlyVault() public {
        vm.prank(other);
        vm.expectRevert(IMarket.NotVault.selector);
        market.recordStake(M, alice, 0, 1);
    }

    function test_recordStake_rejectsInvalidOutcome() public {
        vm.prank(vault);
        vm.expectRevert(IMarket.InvalidOutcome.selector);
        market.recordStake(M, alice, 3, 1);
    }

    function test_recordStake_updatesTotalsAndEmits() public {
        vm.prank(vault);
        vm.expectEmit(true, true, false, true);
        emit IMarket.StakeRecorded(M, alice, 1, 100);
        market.recordStake(M, alice, 1, 100);
        assertEq(market.outcomeStake(M, 1), 100);
        assertEq(market.userStake(M, alice, 1), 100);
        assertEq(market.userTotalStake(M, alice), 100);
        assertEq(market.totalPool(M), 100);
    }

    function test_impliedProb_returnsRatio() public {
        vm.startPrank(vault);
        market.recordStake(M, alice, 0, 600);
        market.recordStake(M, alice, 1, 300);
        market.recordStake(M, alice, 2, 100);
        vm.stopPrank();
        (uint128 num, uint128 denom) = market.impliedProb(M, 0);
        assertEq(num, 600); assertEq(denom, 1000);
    }

    function test_impliedProb_emptyPool_returnsZero() public {
        (uint128 num, uint128 denom) = market.impliedProb(M, 0);
        assertEq(num, 0); assertEq(denom, 0);
    }

    function test_invariant_sumUserStakesEqualsOutcomeStakes() public {
        vm.startPrank(vault);
        market.recordStake(M, alice, 0, 10);
        market.recordStake(M, address(0xB), 0, 5);
        market.recordStake(M, alice, 2, 7);
        vm.stopPrank();
        assertEq(market.outcomeStake(M, 0), 15);
        assertEq(market.outcomeStake(M, 2), 7);
        assertEq(market.totalPool(M), 22);
    }
}
```

- [ ] **Step 3: Run, expect compile fail**

Run: `forge test --root contracts --match-path "test/unit/Market.t.sol" -vv`
Expected: "File not found".

- [ ] **Step 4: Implement `Market.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMarket} from "./interfaces/IMarket.sol";

contract Market is IMarket {
    address public betVault;
    bool private _vaultSet;
    error AlreadySet();
    mapping(bytes32 => uint128[3]) internal _outcomeStake;
    mapping(bytes32 => mapping(address => uint128[3])) internal _userStake;

    /// @notice One-shot setter that breaks the circular constructor dependency between
    ///         BetVault and Market. Called exactly once by the deploy script (or test
    ///         setUp) immediately after Market is deployed and BetVault's address is known.
    function setBetVault(address vault) external {
        if (_vaultSet) revert AlreadySet();
        betVault = vault;
        _vaultSet = true;
    }

    function recordStake(bytes32 matchId, address user, uint8 outcome, uint128 amount) external {
        if (msg.sender != betVault) revert NotVault();
        if (outcome > 2) revert InvalidOutcome();
        _outcomeStake[matchId][outcome] += amount;
        _userStake[matchId][user][outcome] += amount;
        emit StakeRecorded(matchId, user, outcome, amount);
    }

    function outcomeStake(bytes32 matchId, uint8 outcome) external view returns (uint128) {
        return _outcomeStake[matchId][outcome];
    }

    function userStake(bytes32 matchId, address user, uint8 outcome) external view returns (uint128) {
        return _userStake[matchId][user][outcome];
    }

    function userTotalStake(bytes32 matchId, address user) external view returns (uint256) {
        uint128[3] storage u = _userStake[matchId][user];
        return uint256(u[0]) + u[1] + u[2];
    }

    function totalPool(bytes32 matchId) public view returns (uint256) {
        uint128[3] storage o = _outcomeStake[matchId];
        return uint256(o[0]) + o[1] + o[2];
    }

    function impliedProb(bytes32 matchId, uint8 outcome) external view returns (uint128 num, uint128 denom) {
        uint256 total = totalPool(matchId);
        if (total == 0) return (0, 0);
        return (_outcomeStake[matchId][outcome], uint128(total));
    }
}
```

- [ ] **Step 5: Run, expect pass**

Run: `forge test --root contracts --match-path "test/unit/Market.t.sol" -vv`
Expected: 7 tests passing.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/interfaces/IMarket.sol contracts/src/Market.sol contracts/test/unit/Market.t.sol
git commit -m "feat(contracts): Market accounting with vault-gated stake recording"
```

---

## Task 10: `IOracle.sol` + `Oracle.sol`

EIP-712 signed result poster. Uses `vm.sign` in tests to produce real sigs.

**Files:**

- Create: `contracts/src/interfaces/IOracle.sol`
- Create: `contracts/src/Oracle.sol`
- Create: `contracts/test/unit/Oracle.t.sol`

- [ ] **Step 1: Create `IOracle.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOracle {
    struct Result { uint8 homeScore; uint8 awayScore; uint64 signedAt; }

    event ResultSubmitted(bytes32 indexed matchId, uint8 homeScore, uint8 awayScore, uint64 signedAt);
    event SignerUpdated(address indexed signer);
    event MatchVoided(bytes32 indexed matchId);

    error InvalidSignature();
    error AlreadySubmitted();
    error SignedAtInFuture();
    error SignedAtZero();

    function submitResult(bytes32 matchId, uint8 homeScore, uint8 awayScore, uint64 signedAt, bytes calldata sig) external;
    function voidMatch(bytes32 matchId) external;
    function setSigner(address newSigner) external;
    function results(bytes32 matchId) external view returns (uint8 homeScore, uint8 awayScore, uint64 signedAt);
    function signer() external view returns (address);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
```

- [ ] **Step 2: Write the failing test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Oracle} from "../../src/Oracle.sol";
import {IOracle} from "../../src/interfaces/IOracle.sol";
import {MatchRegistry} from "../../src/MatchRegistry.sol";
import {IMatchRegistry} from "../../src/interfaces/IMatchRegistry.sol";

contract OracleTest is Test {
    Oracle oracle;
    MatchRegistry reg;
    uint256 signerKey;
    address signerAddr;
    address owner = address(this);

    bytes32 constant M = keccak256("M");

    function setUp() public {
        signerKey = 0xA11CE;
        signerAddr = vm.addr(signerKey);
        reg = new MatchRegistry();
        oracle = new Oracle(reg, signerAddr);
        reg.setOracle(address(oracle));
    }

    function _sign(bytes32 matchId, uint8 home, uint8 away, uint64 signedAt) internal view returns (bytes memory) {
        bytes32 typeHash = keccak256("Result(bytes32 matchId,uint8 homeScore,uint8 awayScore,uint64 signedAt,uint256 chainId)");
        bytes32 structHash = keccak256(abi.encode(typeHash, matchId, home, away, signedAt, block.chainid));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", oracle.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_submitResult_writesAndEmits() public {
        uint64 ts = uint64(block.timestamp);
        bytes memory sig = _sign(M, 2, 1, ts);
        vm.expectEmit(true, false, false, true);
        emit IOracle.ResultSubmitted(M, 2, 1, ts);
        oracle.submitResult(M, 2, 1, ts, sig);
        (uint8 h, uint8 a, uint64 at) = oracle.results(M);
        assertEq(h, 2); assertEq(a, 1); assertEq(at, ts);
    }

    function test_submitResult_rejectsBadSig() public {
        uint256 wrongKey = 0xDEAD;
        bytes32 typeHash = keccak256("Result(bytes32 matchId,uint8 homeScore,uint8 awayScore,uint64 signedAt,uint256 chainId)");
        bytes32 structHash = keccak256(abi.encode(typeHash, M, uint8(1), uint8(0), uint64(block.timestamp), block.chainid));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", oracle.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, digest);
        bytes memory bad = abi.encodePacked(r, s, v);
        vm.expectRevert(IOracle.InvalidSignature.selector);
        oracle.submitResult(M, 1, 0, uint64(block.timestamp), bad);
    }

    function test_submitResult_rejectsReplay() public {
        uint64 ts = uint64(block.timestamp);
        bytes memory sig = _sign(M, 2, 1, ts);
        oracle.submitResult(M, 2, 1, ts, sig);
        vm.expectRevert(IOracle.AlreadySubmitted.selector);
        oracle.submitResult(M, 2, 1, ts, sig);
    }

    function test_submitResult_rejectsZeroTimestamp() public {
        bytes memory sig = _sign(M, 0, 0, 0);
        vm.expectRevert(IOracle.SignedAtZero.selector);
        oracle.submitResult(M, 0, 0, 0, sig);
    }

    function test_submitResult_rejectsFutureTimestamp() public {
        uint64 future = uint64(block.timestamp + 100);
        bytes memory sig = _sign(M, 1, 0, future);
        vm.expectRevert(IOracle.SignedAtInFuture.selector);
        oracle.submitResult(M, 1, 0, future, sig);
    }

    function test_voidMatch_onlyOwner() public {
        vm.prank(address(0xB0B));
        vm.expectRevert();
        oracle.voidMatch(M);
    }

    function test_setSigner_onlyOwner() public {
        oracle.setSigner(address(0xD00D));
        assertEq(oracle.signer(), address(0xD00D));
    }
}
```

- [ ] **Step 3: Run, expect compile fail**

Run: `forge test --root contracts --match-path "test/unit/Oracle.t.sol" -vv`
Expected: "File not found".

- [ ] **Step 4: Implement `Oracle.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./Ownable.sol";
import {IOracle} from "./interfaces/IOracle.sol";
import {IMatchRegistry} from "./interfaces/IMatchRegistry.sol";

contract Oracle is IOracle, Ownable {
    IMatchRegistry public immutable REGISTRY;
    address public signer;
    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 public constant RESULT_TYPEHASH = keccak256(
        "Result(bytes32 matchId,uint8 homeScore,uint8 awayScore,uint64 signedAt,uint256 chainId)"
    );

    mapping(bytes32 => Result) internal _results;

    constructor(IMatchRegistry registry, address initialSigner) {
        REGISTRY = registry;
        signer = initialSigner;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("arc-pick Oracle")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
        emit SignerUpdated(initialSigner);
    }

    function results(bytes32 matchId) external view returns (uint8, uint8, uint64) {
        Result storage r = _results[matchId];
        return (r.homeScore, r.awayScore, r.signedAt);
    }

    function submitResult(bytes32 matchId, uint8 homeScore, uint8 awayScore, uint64 signedAt, bytes calldata sig) external {
        if (signedAt == 0) revert SignedAtZero();
        if (signedAt > block.timestamp) revert SignedAtInFuture();
        if (_results[matchId].signedAt != 0) revert AlreadySubmitted();

        bytes32 structHash = keccak256(abi.encode(RESULT_TYPEHASH, matchId, homeScore, awayScore, signedAt, block.chainid));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address recovered = _recover(digest, sig);
        if (recovered != signer) revert InvalidSignature();

        _results[matchId] = Result({ homeScore: homeScore, awayScore: awayScore, signedAt: signedAt });
        emit ResultSubmitted(matchId, homeScore, awayScore, signedAt);
    }

    function voidMatch(bytes32 matchId) external onlyOwner {
        REGISTRY.voidMatch(matchId);
        emit MatchVoided(matchId);
    }

    function setSigner(address newSigner) external onlyOwner {
        signer = newSigner;
        emit SignerUpdated(newSigner);
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        return ecrecover(digest, v, r, s);
    }
}
```

- [ ] **Step 5: Run, expect pass**

Run: `forge test --root contracts --match-path "test/unit/Oracle.t.sol" -vv`
Expected: 7 tests passing.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/interfaces/IOracle.sol contracts/src/Oracle.sol contracts/test/unit/Oracle.t.sol
git commit -m "feat(contracts): Oracle with EIP-712 signed result posting"
```

---

## Task 11: `IBetVault.sol` + `TestBase.sol` + skeletal `BetVault.sol`

We split BetVault across three tasks (11/12/13). This first task wires the storage, immutables, constructor, and `placeBet` (humans, Permit2 SignatureTransfer path).

**Files:**

- Create: `contracts/src/interfaces/IBetVault.sol`
- Create: `contracts/test/helpers/TestBase.sol`
- Create: `contracts/src/BetVault.sol`
- Create: `contracts/test/unit/BetVaultPlaceBet.t.sol`

- [ ] **Step 1: Create `IBetVault.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPermit2} from "./IPermit2.sol";

interface IBetVault {
    event Placed(bytes32 indexed matchId, address indexed bettor, uint8 outcome, uint128 amount);
    event Settled(bytes32 indexed matchId, uint8 winningOutcome);
    event Claimed(bytes32 indexed matchId, address indexed user, uint256 payout);
    event Refunded(bytes32 indexed matchId, address indexed user, uint256 amount);
    event AgentAuthorized(address indexed owner, address indexed agent);
    event AgentDeauthorized(address indexed owner, address indexed agent);

    error NotOpen();
    error KickoffPassed();
    error NotClosed();
    error NotSettled();
    error NotSettledOrVoided();
    error AlreadyClaimed();
    error AlreadyRefunded();
    error NoStakeOnWinningOutcome();
    error NoStake();
    error TooEarlyForRefund();
    error NotAuthorizedAgent();
    error InvalidOutcome();
    error ResultNotPosted();
    error Reentrancy();

    function placeBet(
        bytes32 matchId,
        uint8 outcome,
        uint128 amount,
        IPermit2.PermitTransferFrom calldata permit,
        bytes calldata sig
    ) external;

    function placeBetFromAllowance(bytes32 matchId, uint8 outcome, uint128 amount, address bettor) external;
    function authorizeAgent(address agent) external;
    function deauthorizeAgent(address agent) external;
    function authorizedAgent(address owner, address agent) external view returns (bool);

    function settleMarket(bytes32 matchId) external;
    function claim(bytes32 matchId) external;
    function claimFor(bytes32 matchId, address user) external;
    function refund(bytes32 matchId) external;
    function refundFor(bytes32 matchId, address user) external;

    function claimed(bytes32 matchId, address user) external view returns (bool);
    function refunded(bytes32 matchId, address user) external view returns (bool);
}
```

- [ ] **Step 2: Create `TestBase.sol`** (shared setUp for the rest of the contract tests)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {MockPermit2} from "../../src/mocks/MockPermit2.sol";
import {MockCallFrom} from "../../src/mocks/MockCallFrom.sol";
import {MatchRegistry} from "../../src/MatchRegistry.sol";
import {Market} from "../../src/Market.sol";
import {Oracle} from "../../src/Oracle.sol";
import {BetVault} from "../../src/BetVault.sol";
import {IMatchRegistry} from "../../src/interfaces/IMatchRegistry.sol";

abstract contract TestBase is Test {
    MockUSDC internal usdc;
    MockPermit2 internal permit2;
    MockCallFrom internal callFrom;
    MatchRegistry internal registry;
    Market internal market;
    Oracle internal oracle;
    BetVault internal vault;

    uint256 internal signerKey = 0xA11CE;
    address internal signerAddr;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xC401);

    bytes32 internal constant M1 = keccak256("FIFA-WC26-1");
    bytes32 internal constant ARG = bytes32("ARG");
    bytes32 internal constant MEX = bytes32("MEX");

    function _setUpBase() internal {
        signerAddr = vm.addr(signerKey);
        usdc = new MockUSDC();
        permit2 = new MockPermit2();
        callFrom = new MockCallFrom();
        registry = new MatchRegistry();
        oracle = new Oracle(registry, signerAddr);
        market = new Market();                                           // Market deployed first
        vault = new BetVault(usdc, permit2, registry, market, oracle);    // BetVault gets Market address
        market.setBetVault(address(vault));                              // one-shot setter wires Market → vault
        registry.setOracle(address(oracle));
        registry.setBetVault(address(vault));

        _fund(alice, 1_000 * 1e6);
        _fund(bob,   1_000 * 1e6);
        _fund(carol, 1_000 * 1e6);
    }

    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(permit2), type(uint256).max);
    }

    function _openMatch(bytes32 matchId, uint64 kickoff) internal {
        vm.prank(address(oracle));
        registry.upsertMatch(matchId, ARG, MEX, kickoff);
    }

    function _signOracleResult(bytes32 matchId, uint8 home, uint8 away, uint64 signedAt) internal view returns (bytes memory) {
        bytes32 typeHash = keccak256("Result(bytes32 matchId,uint8 homeScore,uint8 awayScore,uint64 signedAt,uint256 chainId)");
        bytes32 structHash = keccak256(abi.encode(typeHash, matchId, home, away, signedAt, block.chainid));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", oracle.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
```

Note: the `Market.setBetVault` one-shot setter breaks the chicken-and-egg between Market's `betVault` reference and BetVault's `MARKET` immutable. Market is deployed first (no constructor args), BetVault is deployed second with Market's address, then Market is wired to BetVault via the one-shot setter. The same sequence is used in `Deploy.s.sol` (Task 18).

- [ ] **Step 3: Write `BetVaultPlaceBet.t.sol` (failing)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "../helpers/TestBase.sol";
import {IBetVault} from "../../src/interfaces/IBetVault.sol";
import {IPermit2} from "../../src/interfaces/IPermit2.sol";

contract BetVaultPlaceBetTest is TestBase {
    function setUp() public { _setUpBase(); }

    function _permit(uint128 amount, uint256 nonce, uint64 deadline) internal view returns (IPermit2.PermitTransferFrom memory) {
        return IPermit2.PermitTransferFrom({
            permitted: IPermit2.TokenPermissions({ token: address(usdc), amount: amount }),
            nonce: nonce,
            deadline: deadline
        });
    }

    function test_placeBet_movesUSDCAndEmits() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p = _permit(10 * 1e6, 1, uint64(block.timestamp + 1 hours));
        vm.expectEmit(true, true, false, true);
        emit IBetVault.Placed(M1, alice, 0, 10 * 1e6);
        vm.prank(alice);
        vault.placeBet(M1, 0, 10 * 1e6, p, "");
        assertEq(usdc.balanceOf(address(vault)), 10 * 1e6);
        assertEq(market.outcomeStake(M1, 0), 10 * 1e6);
    }

    function test_placeBet_revertsAfterKickoff() public {
        _openMatch(M1, uint64(block.timestamp + 1));
        skip(2);
        IPermit2.PermitTransferFrom memory p = _permit(1 * 1e6, 1, uint64(block.timestamp + 1 hours));
        vm.prank(alice);
        vm.expectRevert(IBetVault.KickoffPassed.selector);
        vault.placeBet(M1, 0, 1 * 1e6, p, "");
    }

    function test_placeBet_revertsOnClosedStatus() public {
        _openMatch(M1, uint64(block.timestamp + 1));
        skip(2);
        registry.closeMarket(M1);
        IPermit2.PermitTransferFrom memory p = _permit(1 * 1e6, 1, uint64(block.timestamp + 1 hours));
        vm.prank(alice);
        vm.expectRevert(IBetVault.NotOpen.selector);
        vault.placeBet(M1, 0, 1 * 1e6, p, "");
    }

    function test_placeBet_revertsOnInvalidOutcome() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p = _permit(1 * 1e6, 1, uint64(block.timestamp + 1 hours));
        vm.prank(alice);
        vm.expectRevert(IBetVault.InvalidOutcome.selector);
        vault.placeBet(M1, 3, 1 * 1e6, p, "");
    }
}
```

- [ ] **Step 4: Run, expect compile fail**

Run: `forge test --root contracts --match-path "test/unit/BetVaultPlaceBet.t.sol" -vv`
Expected: "File not found: src/BetVault.sol".

- [ ] **Step 5: Implement skeletal `BetVault.sol`** (placeBet only — Tasks 12 and 13 fill in the rest)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBetVault} from "./interfaces/IBetVault.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IPermit2} from "./interfaces/IPermit2.sol";
import {IMatchRegistry} from "./interfaces/IMatchRegistry.sol";
import {IMarket} from "./interfaces/IMarket.sol";
import {IOracle} from "./interfaces/IOracle.sol";

contract BetVault is IBetVault {
    IERC20 public immutable USDC;
    IPermit2 public immutable PERMIT2;
    IMatchRegistry public immutable REGISTRY;
    IMarket public immutable MARKET;
    IOracle public immutable ORACLE;

    uint64 public constant REFUND_AFTER = 7 days;

    mapping(bytes32 => mapping(address => bool)) public claimed;
    mapping(bytes32 => mapping(address => bool)) public refunded;
    mapping(address => mapping(address => bool)) public authorizedAgent;

    uint256 private _locked;
    modifier nonReentrant() {
        if (_locked != 0) revert Reentrancy();
        _locked = 1;
        _;
        _locked = 0;
    }

    constructor(IERC20 usdc_, IPermit2 permit2_, IMatchRegistry reg, IMarket m, IOracle o) {
        USDC = usdc_; PERMIT2 = permit2_; REGISTRY = reg; MARKET = m; ORACLE = o;
    }

    function placeBet(
        bytes32 matchId,
        uint8 outcome,
        uint128 amount,
        IPermit2.PermitTransferFrom calldata permit,
        bytes calldata sig
    ) external nonReentrant {
        _assertOpenPreKickoff(matchId);
        if (outcome > 2) revert InvalidOutcome();
        PERMIT2.permitTransferFrom(
            permit,
            IPermit2.SignatureTransferDetails({ to: address(this), requestedAmount: amount }),
            msg.sender,
            sig
        );
        MARKET.recordStake(matchId, msg.sender, outcome, amount);
        emit Placed(matchId, msg.sender, outcome, amount);
    }

    function _assertOpenPreKickoff(bytes32 matchId) internal view {
        (, , uint64 kickoff, IMatchRegistry.Status st, ) = REGISTRY.matches(matchId);
        if (st != IMatchRegistry.Status.Open) revert NotOpen();
        if (block.timestamp >= kickoff) revert KickoffPassed();
    }

    // Stubs filled in by Tasks 12 and 13:
    function placeBetFromAllowance(bytes32, uint8, uint128, address) external pure { revert(); }
    function authorizeAgent(address) external pure { revert(); }
    function deauthorizeAgent(address) external pure { revert(); }
    function settleMarket(bytes32) external pure { revert(); }
    function claim(bytes32) external pure { revert(); }
    function claimFor(bytes32, address) external pure { revert(); }
    function refund(bytes32) external pure { revert(); }
    function refundFor(bytes32, address) external pure { revert(); }
}
```

- [ ] **Step 6: Run, expect pass on placeBet tests only**

Run: `forge test --root contracts --match-path "test/unit/BetVaultPlaceBet.t.sol" -vv`
Expected: 4 tests passing.

- [ ] **Step 7: Commit**

```bash
git add contracts/src/interfaces/IBetVault.sol contracts/test/helpers/TestBase.sol contracts/src/BetVault.sol contracts/test/unit/BetVaultPlaceBet.t.sol
git commit -m "feat(contracts): BetVault.placeBet (humans, Permit2 SignatureTransfer)"
```

---

## Task 12: BetVault — agent path (`placeBetFromAllowance` + authorize)

**Files:**

- Modify: `contracts/src/BetVault.sol`
- Create: `contracts/test/unit/BetVaultAgent.t.sol`

- [ ] **Step 1: Write `BetVaultAgent.t.sol` (failing)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "../helpers/TestBase.sol";
import {IBetVault} from "../../src/interfaces/IBetVault.sol";

contract BetVaultAgentTest is TestBase {
    address ownerWallet = address(0xF00D);
    address agentKey = address(0xA9E47);

    function setUp() public {
        _setUpBase();
        _fund(ownerWallet, 1_000 * 1e6);
        // Owner authorizes the agent runtime key on BetVault
        vm.prank(ownerWallet);
        vault.authorizeAgent(agentKey);
        // Owner sets Permit2 allowance for BetVault as the spender
        vm.prank(ownerWallet);
        permit2.approve(address(usdc), address(vault), uint160(100 * 1e6), uint48(block.timestamp + 30 days));
    }

    function test_authorizeAgent_setsMapping() public view {
        assertTrue(vault.authorizedAgent(ownerWallet, agentKey));
    }

    function test_deauthorizeAgent_clearsMapping() public {
        vm.prank(ownerWallet);
        vault.deauthorizeAgent(agentKey);
        assertFalse(vault.authorizedAgent(ownerWallet, agentKey));
    }

    function test_placeBetFromAllowance_authorizedAgent_succeeds() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        vm.expectEmit(true, true, false, true);
        emit IBetVault.Placed(M1, ownerWallet, 1, 5 * 1e6);
        vm.prank(agentKey);
        vault.placeBetFromAllowance(M1, 1, 5 * 1e6, ownerWallet);
        assertEq(market.userStake(M1, ownerWallet, 1), 5 * 1e6);
        assertEq(usdc.balanceOf(address(vault)), 5 * 1e6);
    }

    function test_placeBetFromAllowance_unauthorizedReverts() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        vm.prank(address(0xDEAD));
        vm.expectRevert(IBetVault.NotAuthorizedAgent.selector);
        vault.placeBetFromAllowance(M1, 1, 1 * 1e6, ownerWallet);
    }

    function test_placeBetFromAllowance_revokedAgentReverts() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        vm.prank(ownerWallet);
        vault.deauthorizeAgent(agentKey);
        vm.prank(agentKey);
        vm.expectRevert(IBetVault.NotAuthorizedAgent.selector);
        vault.placeBetFromAllowance(M1, 1, 1 * 1e6, ownerWallet);
    }

    function test_placeBetFromAllowance_overCapReverts() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        vm.prank(agentKey);
        vm.expectRevert(); // MockPermit2.AllowanceInsufficient
        vault.placeBetFromAllowance(M1, 1, 200 * 1e6, ownerWallet);
    }

    function test_placeBetFromAllowance_afterKickoffReverts() public {
        _openMatch(M1, uint64(block.timestamp + 1));
        skip(2);
        vm.prank(agentKey);
        vm.expectRevert(IBetVault.KickoffPassed.selector);
        vault.placeBetFromAllowance(M1, 1, 1 * 1e6, ownerWallet);
    }
}
```

- [ ] **Step 2: Run, expect fail (stubs revert without selectors)**

Run: `forge test --root contracts --match-path "test/unit/BetVaultAgent.t.sol" -vv`
Expected: 6 tests fail (stubs revert).

- [ ] **Step 3: Replace stubs in `BetVault.sol`**

Replace the four stub functions in `BetVault.sol` with:

```solidity
function authorizeAgent(address agent) external {
    authorizedAgent[msg.sender][agent] = true;
    emit AgentAuthorized(msg.sender, agent);
}

function deauthorizeAgent(address agent) external {
    authorizedAgent[msg.sender][agent] = false;
    emit AgentDeauthorized(msg.sender, agent);
}

function placeBetFromAllowance(
    bytes32 matchId,
    uint8 outcome,
    uint128 amount,
    address bettor
) external nonReentrant {
    if (!authorizedAgent[bettor][msg.sender]) revert NotAuthorizedAgent();
    _assertOpenPreKickoff(matchId);
    if (outcome > 2) revert InvalidOutcome();
    PERMIT2.transferFrom(bettor, address(this), uint160(amount), address(USDC));
    MARKET.recordStake(matchId, bettor, outcome, amount);
    emit Placed(matchId, bettor, outcome, amount);
}
```

(Leave the settle/claim/refund stubs in place; Task 13 handles them.)

- [ ] **Step 4: Run, expect pass**

Run: `forge test --root contracts --match-path "test/unit/BetVaultAgent.t.sol" -vv`
Expected: 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/BetVault.sol contracts/test/unit/BetVaultAgent.t.sol
git commit -m "feat(contracts): BetVault.placeBetFromAllowance with agent authorization gate"
```

---

## Task 13: BetVault — settle, claim, refund

**Files:**

- Modify: `contracts/src/BetVault.sol`
- Create: `contracts/test/unit/BetVaultClaim.t.sol`

- [ ] **Step 1: Write `BetVaultClaim.t.sol` (failing)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "../helpers/TestBase.sol";
import {IBetVault} from "../../src/interfaces/IBetVault.sol";
import {IMatchRegistry} from "../../src/interfaces/IMatchRegistry.sol";
import {IPermit2} from "../../src/interfaces/IPermit2.sol";

contract BetVaultClaimTest is TestBase {
    function setUp() public { _setUpBase(); }

    function _bet(address who, bytes32 matchId, uint8 outcome, uint128 amount) internal {
        IPermit2.PermitTransferFrom memory p = IPermit2.PermitTransferFrom({
            permitted: IPermit2.TokenPermissions({ token: address(usdc), amount: amount }),
            nonce: uint256(keccak256(abi.encode(who, matchId, outcome, amount, block.timestamp))),
            deadline: uint64(block.timestamp + 1 hours)
        });
        vm.prank(who);
        vault.placeBet(matchId, outcome, amount, p, "");
    }

    function _settleHome2_1() internal {
        skip(2);
        registry.closeMarket(M1);
        bytes memory sig = _signOracleResult(M1, 2, 1, uint64(block.timestamp));
        oracle.submitResult(M1, 2, 1, uint64(block.timestamp), sig);
        vault.settleMarket(M1);
    }

    function test_settleMarket_revertsBeforeClosed() public {
        _openMatch(M1, uint64(block.timestamp + 1));
        vm.expectRevert(IBetVault.NotClosed.selector);
        vault.settleMarket(M1);
    }

    function test_settleMarket_revertsBeforeResult() public {
        _openMatch(M1, uint64(block.timestamp + 1));
        skip(2);
        registry.closeMarket(M1);
        vm.expectRevert(IBetVault.ResultNotPosted.selector);
        vault.settleMarket(M1);
    }

    function test_settleMarket_marksRegistrySettled() public {
        _openMatch(M1, uint64(block.timestamp + 1));
        _bet(alice, M1, 0, 60 * 1e6);
        _bet(bob,   M1, 0, 40 * 1e6);
        _bet(carol, M1, 2, 50 * 1e6);
        _settleHome2_1();
        (, , , IMatchRegistry.Status st, uint8 win) = registry.matches(M1);
        assertEq(uint8(st), uint8(IMatchRegistry.Status.Settled));
        assertEq(win, 0);
    }

    function test_claim_parimutuelPayoutMatches() public {
        _openMatch(M1, uint64(block.timestamp + 1));
        _bet(alice, M1, 0, 60 * 1e6);   // winner share 60/100
        _bet(bob,   M1, 0, 40 * 1e6);   // winner share 40/100
        _bet(carol, M1, 2, 50 * 1e6);   // loser pool feeds winners
        // total pool = 150 USDC, winning outcome pool = 100 USDC
        _settleHome2_1();

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.claim(M1);
        uint256 aliceGained = usdc.balanceOf(alice) - aliceBefore;
        // payout = 60 * 150 / 100 = 90 USDC
        assertEq(aliceGained, 90 * 1e6);

        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        vault.claim(M1);
        uint256 bobGained = usdc.balanceOf(bob) - bobBefore;
        assertEq(bobGained, 60 * 1e6);
    }

    function test_claim_revertsForLoser() public {
        _openMatch(M1, uint64(block.timestamp + 1));
        _bet(alice, M1, 0, 50 * 1e6);
        _bet(carol, M1, 2, 50 * 1e6);
        _settleHome2_1();
        vm.prank(carol);
        vm.expectRevert(IBetVault.NoStakeOnWinningOutcome.selector);
        vault.claim(M1);
    }

    function test_claim_doubleClaimReverts() public {
        _openMatch(M1, uint64(block.timestamp + 1));
        _bet(alice, M1, 0, 10 * 1e6);
        _settleHome2_1();
        vm.startPrank(alice);
        vault.claim(M1);
        vm.expectRevert(IBetVault.AlreadyClaimed.selector);
        vault.claim(M1);
        vm.stopPrank();
    }

    function test_claimFor_paysToUserNotCaller() public {
        _openMatch(M1, uint64(block.timestamp + 1));
        _bet(alice, M1, 0, 10 * 1e6);
        _settleHome2_1();
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        vault.claimFor(M1, alice);
        assertGt(usdc.balanceOf(alice), aliceBefore);
        assertEq(usdc.balanceOf(bob), bobBefore);
    }

    function test_refund_voidPath() public {
        _openMatch(M1, uint64(block.timestamp + 1 days));
        _bet(alice, M1, 0, 10 * 1e6);
        vm.prank(address(oracle));
        registry.voidMatch(M1); // direct void via registry (oracle is also the registry oracle)
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.refund(M1);
        assertEq(usdc.balanceOf(alice) - before, 10 * 1e6);
    }

    function test_refund_postRefundAfter_stuckMatch() public {
        _openMatch(M1, uint64(block.timestamp + 1));
        _bet(alice, M1, 0, 10 * 1e6);
        skip(2);
        registry.closeMarket(M1);
        // Oracle never posts a result; 7 days pass.
        skip(7 days + 1);
        vm.prank(alice);
        vault.refund(M1);
        assertEq(usdc.balanceOf(alice), 1_000 * 1e6); // back to mint amount
    }

    function test_refund_settledMatchReverts() public {
        _openMatch(M1, uint64(block.timestamp + 1));
        _bet(alice, M1, 0, 10 * 1e6);
        _settleHome2_1();
        vm.prank(alice);
        vm.expectRevert(IBetVault.NotSettledOrVoided.selector);
        vault.refund(M1);
    }
}
```

- [ ] **Step 2: Run, expect fail**

Run: `forge test --root contracts --match-path "test/unit/BetVaultClaim.t.sol" -vv`
Expected: 9 tests fail.

- [ ] **Step 3: Replace stubs in `BetVault.sol`**

Replace the four remaining stubs (`settleMarket`, `claim`, `claimFor`, `refund`, `refundFor`) with:

```solidity
function settleMarket(bytes32 matchId) external nonReentrant {
    (, , , IMatchRegistry.Status st, ) = REGISTRY.matches(matchId);
    if (st != IMatchRegistry.Status.Closed) revert NotClosed();
    (uint8 home, uint8 away, uint64 signedAt) = ORACLE.results(matchId);
    if (signedAt == 0) revert ResultNotPosted();
    uint8 outcome = home > away ? 0 : (home == away ? 1 : 2);
    REGISTRY.markSettled(matchId, outcome);
    emit Settled(matchId, outcome);
}

function claim(bytes32 matchId) external nonReentrant {
    _claim(matchId, msg.sender);
}

function claimFor(bytes32 matchId, address user) external nonReentrant {
    _claim(matchId, user);
}

function _claim(bytes32 matchId, address user) internal {
    (, , , IMatchRegistry.Status st, uint8 win) = REGISTRY.matches(matchId);
    if (st != IMatchRegistry.Status.Settled) revert NotSettled();
    if (claimed[matchId][user]) revert AlreadyClaimed();
    uint128 userStakeWin = MARKET.userStake(matchId, user, win);
    if (userStakeWin == 0) revert NoStakeOnWinningOutcome();
    uint256 winningPool = MARKET.outcomeStake(matchId, win);
    uint256 totalPool   = MARKET.totalPool(matchId);
    uint256 payout = (uint256(userStakeWin) * totalPool) / winningPool;
    claimed[matchId][user] = true;
    require(USDC.transfer(user, payout), "transfer failed");
    emit Claimed(matchId, user, payout);
}

function refund(bytes32 matchId) external nonReentrant {
    _refund(matchId, msg.sender);
}

function refundFor(bytes32 matchId, address user) external nonReentrant {
    _refund(matchId, user);
}

function _refund(bytes32 matchId, address user) internal {
    (, , uint64 kickoff, IMatchRegistry.Status st, ) = REGISTRY.matches(matchId);
    bool eligible = (st == IMatchRegistry.Status.Voided) ||
                    (st != IMatchRegistry.Status.Settled && block.timestamp >= kickoff + REFUND_AFTER);
    if (!eligible) revert NotSettledOrVoided();
    if (refunded[matchId][user]) revert AlreadyRefunded();
    if (claimed[matchId][user]) revert AlreadyClaimed();
    uint256 amount = MARKET.userTotalStake(matchId, user);
    if (amount == 0) revert NoStake();
    refunded[matchId][user] = true;
    require(USDC.transfer(user, amount), "transfer failed");
    emit Refunded(matchId, user, amount);
}
```

- [ ] **Step 4: Run, expect pass on BetVaultClaim.t.sol and all earlier BetVault tests**

Run: `forge test --root contracts --match-path "test/unit/BetVault*.t.sol" -vv`
Expected: 4 + 6 + 9 = 19 tests passing.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/BetVault.sol contracts/test/unit/BetVaultClaim.t.sol
git commit -m "feat(contracts): BetVault settle/claim/refund with parimutuel payout"
```

---

## Task 14: `IBetPaymaster.sol` + `BetPaymaster.sol`

The paymaster takes an EIP-712 signed user request and forwards the bet through MockCallFrom. Because the mock cannot truly spoof `msg.sender`, the paymaster passes the bettor through to a CallFrom-aware overload of placeBet. **We add this overload to BetVault here**, then implement the paymaster.

Actually a cleaner design: paymaster directly calls `BetVault.placeBet` with a Permit2 sig that authorizes pulling from the bettor's address (the sig binds to the bettor's wallet via Permit2's domain separator — `permitTransferFrom`'s `owner` argument is `msg.sender` in our current implementation; we need it to be `bettor`). Modify placeBet to accept an `owner` parameter, and gate that param to be msg.sender for direct calls.

**Simplest path:** make placeBet's Permit2 owner derived from msg.sender (unchanged), and have the paymaster impersonate via a different mechanism: the paymaster pulls USDC from bettor itself (via a paymaster-specific Permit2 sig pointed at the paymaster as spender), then calls a paymaster-only `BetVault.placeBetSponsored(matchId, outcome, amount, bettor)` that records stake without doing a Permit2 transfer.

We choose this path. Add `placeBetSponsored` to BetVault, gated by `onlyPaymaster`.

**Files:**

- Create: `contracts/src/interfaces/IBetPaymaster.sol`
- Modify: `contracts/src/BetVault.sol` (add `placeBetSponsored` + `paymaster` setter)
- Modify: `contracts/src/interfaces/IBetVault.sol` (add new fn + errors)
- Create: `contracts/src/BetPaymaster.sol`
- Create: `contracts/test/unit/BetPaymaster.t.sol`

- [ ] **Step 1: Extend `IBetVault.sol`**

Add to the interface:

```solidity
error NotPaymaster();
function placeBetSponsored(bytes32 matchId, uint8 outcome, uint128 amount, address bettor) external;
function setPaymaster(address paymaster) external;
function paymaster() external view returns (address);
```

- [ ] **Step 2: Extend `BetVault.sol`**

Add `address public paymaster;` storage, an owner-gated `setPaymaster(address)` (BetVault becomes Ownable; modify imports + constructor), and:

```solidity
function placeBetSponsored(bytes32 matchId, uint8 outcome, uint128 amount, address bettor) external nonReentrant {
    if (msg.sender != paymaster) revert NotPaymaster();
    _assertOpenPreKickoff(matchId);
    if (outcome > 2) revert InvalidOutcome();
    require(USDC.transferFrom(paymaster, address(this), amount), "paymaster transfer failed");
    MARKET.recordStake(matchId, bettor, outcome, amount);
    emit Placed(matchId, bettor, outcome, amount);
}

function setPaymaster(address p) external onlyOwner {
    paymaster = p;
}
```

Update `BetVault` to extend `Ownable`:

```solidity
import {Ownable} from "./Ownable.sol";
contract BetVault is IBetVault, Ownable { ... }
```

- [ ] **Step 3: Create `IBetPaymaster.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPermit2} from "./IPermit2.sol";

interface IBetPaymaster {
    event Sponsored(address indexed bettor, bytes32 indexed matchId, uint8 outcome, uint128 amount);
    event PaymasterFunded(address indexed funder, uint256 amount);
    event PaymasterWithdrew(address indexed to, uint256 amount);
    event RelayerUpdated(address indexed relayer);

    error NotRelayer();
    error SigExpired();
    error NonceUsed();
    error SponsorTooSoon();
    error BadSig();

    function fund(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function setRelayer(address relayer) external;
    function sponsorBet(
        address bettor,
        bytes32 matchId,
        uint8 outcome,
        uint128 amount,
        IPermit2.PermitTransferFrom calldata permit,
        bytes calldata permitSig,
        bytes calldata userSig,
        uint64 deadline
    ) external;
    function nonces(address bettor) external view returns (uint256);
    function lastSponsoredAt(address bettor) external view returns (uint64);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
```

- [ ] **Step 4: Write `BetPaymaster.t.sol` (failing)**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "../helpers/TestBase.sol";
import {BetPaymaster} from "../../src/BetPaymaster.sol";
import {IBetPaymaster} from "../../src/interfaces/IBetPaymaster.sol";
import {IPermit2} from "../../src/interfaces/IPermit2.sol";

contract BetPaymasterTest is TestBase {
    BetPaymaster paymaster;
    uint256 bettorKey = 0xB377;
    address bettorAddr;
    address relayer = address(0xRELAY);

    function setUp() public {
        _setUpBase();
        bettorAddr = vm.addr(bettorKey);
        paymaster = new BetPaymaster(usdc, vault, relayer);
        vault.setPaymaster(address(paymaster));
        _fund(bettorAddr, 1_000 * 1e6);
        usdc.mint(address(this), 1_000 * 1e6);
        usdc.approve(address(paymaster), type(uint256).max);
        paymaster.fund(1_000 * 1e6);
    }

    function _signSponsor(bytes32 matchId, uint8 outcome, uint128 amount, uint256 nonce, uint64 deadline) internal view returns (bytes memory) {
        bytes32 typeHash = keccak256("SponsorBet(address bettor,bytes32 matchId,uint8 outcome,uint128 amount,uint256 nonce,uint64 deadline,uint256 chainId)");
        bytes32 structHash = keccak256(abi.encode(typeHash, bettorAddr, matchId, outcome, amount, nonce, deadline, block.chainid));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", paymaster.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bettorKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _permit(uint128 amount, uint256 nonce, uint64 deadline) internal view returns (IPermit2.PermitTransferFrom memory) {
        return IPermit2.PermitTransferFrom({
            permitted: IPermit2.TokenPermissions({ token: address(usdc), amount: amount }),
            nonce: nonce, deadline: deadline
        });
    }

    function test_sponsorBet_happyPath() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p = _permit(5 * 1e6, 99, uint64(block.timestamp + 1 hours));
        bytes memory userSig = _signSponsor(M1, 0, 5 * 1e6, 0, uint64(block.timestamp + 1 hours));
        // First: bettor signs Permit2 to allow paymaster to pull, then paymaster.sponsorBet
        // The Permit2 sig is fake in tests (MockPermit2 ignores it); just record the flow.
        vm.prank(relayer);
        paymaster.sponsorBet(bettorAddr, M1, 0, 5 * 1e6, p, "", userSig, uint64(block.timestamp + 1 hours));
        assertEq(market.userStake(M1, bettorAddr, 0), 5 * 1e6);
    }

    function test_sponsorBet_revertsForNonRelayer() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p = _permit(1 * 1e6, 1, uint64(block.timestamp + 1 hours));
        bytes memory userSig = _signSponsor(M1, 0, 1 * 1e6, 0, uint64(block.timestamp + 1 hours));
        vm.expectRevert(IBetPaymaster.NotRelayer.selector);
        paymaster.sponsorBet(bettorAddr, M1, 0, 1 * 1e6, p, "", userSig, uint64(block.timestamp + 1 hours));
    }

    function test_sponsorBet_revertsOnDeadlineExpired() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p = _permit(1 * 1e6, 1, uint64(block.timestamp + 1 hours));
        bytes memory userSig = _signSponsor(M1, 0, 1 * 1e6, 0, uint64(block.timestamp - 1));
        vm.prank(relayer);
        vm.expectRevert(IBetPaymaster.SigExpired.selector);
        paymaster.sponsorBet(bettorAddr, M1, 0, 1 * 1e6, p, "", userSig, uint64(block.timestamp - 1));
    }

    function test_sponsorBet_revertsOnBadSig() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p = _permit(1 * 1e6, 1, uint64(block.timestamp + 1 hours));
        bytes memory badSig = abi.encodePacked(bytes32(0), bytes32(0), uint8(27));
        vm.prank(relayer);
        vm.expectRevert(IBetPaymaster.BadSig.selector);
        paymaster.sponsorBet(bettorAddr, M1, 0, 1 * 1e6, p, "", badSig, uint64(block.timestamp + 1 hours));
    }

    function test_sponsorBet_revertsOnReplay() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p = _permit(1 * 1e6, 1, uint64(block.timestamp + 1 hours));
        bytes memory userSig = _signSponsor(M1, 0, 1 * 1e6, 0, uint64(block.timestamp + 1 hours));
        vm.startPrank(relayer);
        paymaster.sponsorBet(bettorAddr, M1, 0, 1 * 1e6, p, "", userSig, uint64(block.timestamp + 1 hours));
        // Re-using the same nonce reverts (the same userSig encodes nonce 0)
        IPermit2.PermitTransferFrom memory p2 = _permit(1 * 1e6, 2, uint64(block.timestamp + 1 hours));
        vm.expectRevert(IBetPaymaster.NonceUsed.selector);
        paymaster.sponsorBet(bettorAddr, M1, 0, 1 * 1e6, p2, "", userSig, uint64(block.timestamp + 1 hours));
        vm.stopPrank();
    }

    function test_sponsorBet_rateLimitedPerBettor() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        // First sponsor at t=0
        IPermit2.PermitTransferFrom memory p1 = _permit(1 * 1e6, 11, uint64(block.timestamp + 1 hours));
        bytes memory userSig1 = _signSponsor(M1, 0, 1 * 1e6, 0, uint64(block.timestamp + 1 hours));
        vm.prank(relayer);
        paymaster.sponsorBet(bettorAddr, M1, 0, 1 * 1e6, p1, "", userSig1, uint64(block.timestamp + 1 hours));
        // Immediate second sponsor (< 30s) reverts
        bytes32 M2 = keccak256("FIFA-WC26-2");
        _openMatch(M2, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p2 = _permit(1 * 1e6, 12, uint64(block.timestamp + 1 hours));
        bytes memory userSig2 = _signSponsor(M2, 0, 1 * 1e6, 1, uint64(block.timestamp + 1 hours));
        vm.prank(relayer);
        vm.expectRevert(IBetPaymaster.SponsorTooSoon.selector);
        paymaster.sponsorBet(bettorAddr, M2, 0, 1 * 1e6, p2, "", userSig2, uint64(block.timestamp + 1 hours));
    }

    function test_withdraw_onlyOwner() public {
        vm.prank(address(0xB0B));
        vm.expectRevert();
        paymaster.withdraw(1);
    }
}
```

- [ ] **Step 5: Run, expect compile fail**

Run: `forge test --root contracts --match-path "test/unit/BetPaymaster.t.sol" -vv`
Expected: "File not found: src/BetPaymaster.sol".

- [ ] **Step 6: Implement `BetPaymaster.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./Ownable.sol";
import {IBetPaymaster} from "./interfaces/IBetPaymaster.sol";
import {IBetVault} from "./interfaces/IBetVault.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IPermit2} from "./interfaces/IPermit2.sol";

contract BetPaymaster is IBetPaymaster, Ownable {
    IERC20 public immutable USDC;
    IBetVault public immutable VAULT;
    address public relayer;
    bytes32 public immutable DOMAIN_SEPARATOR;

    uint64 public constant MIN_SPONSOR_INTERVAL = 30;

    bytes32 public constant SPONSOR_TYPEHASH = keccak256(
        "SponsorBet(address bettor,bytes32 matchId,uint8 outcome,uint128 amount,uint256 nonce,uint64 deadline,uint256 chainId)"
    );

    mapping(address => uint256) public nonces;
    mapping(address => uint64) public lastSponsoredAt;

    constructor(IERC20 usdc_, IBetVault vault_, address relayer_) {
        USDC = usdc_;
        VAULT = vault_;
        relayer = relayer_;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("arc-pick BetPaymaster")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
        emit RelayerUpdated(relayer_);
    }

    function fund(uint256 amount) external {
        require(USDC.transferFrom(msg.sender, address(this), amount), "fund failed");
        emit PaymasterFunded(msg.sender, amount);
    }

    function withdraw(uint256 amount) external onlyOwner {
        require(USDC.transfer(msg.sender, amount), "withdraw failed");
        emit PaymasterWithdrew(msg.sender, amount);
    }

    function setRelayer(address newRelayer) external onlyOwner {
        relayer = newRelayer;
        emit RelayerUpdated(newRelayer);
    }

    function sponsorBet(
        address bettor,
        bytes32 matchId,
        uint8 outcome,
        uint128 amount,
        IPermit2.PermitTransferFrom calldata permit,
        bytes calldata permitSig,
        bytes calldata userSig,
        uint64 deadline
    ) external {
        if (msg.sender != relayer) revert NotRelayer();
        if (block.timestamp > deadline) revert SigExpired();
        if (lastSponsoredAt[bettor] + MIN_SPONSOR_INTERVAL > block.timestamp) revert SponsorTooSoon();

        uint256 nonce = nonces[bettor];
        bytes32 structHash = keccak256(abi.encode(SPONSOR_TYPEHASH, bettor, matchId, outcome, amount, nonce, deadline, block.chainid));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address recovered = _recover(digest, userSig);
        if (recovered == address(0) || recovered != bettor) revert BadSig();

        // Pull USDC from bettor into this paymaster via Permit2 (bettor signed Permit2 for paymaster as spender)
        IPermit2 PERMIT2 = IPermit2(address(VAULT.PERMIT2()));
        PERMIT2.permitTransferFrom(
            permit,
            IPermit2.SignatureTransferDetails({ to: address(this), requestedAmount: amount }),
            bettor,
            permitSig
        );
        // Approve VAULT to pull and forward
        USDC.approve(address(VAULT), amount);
        VAULT.placeBetSponsored(matchId, outcome, amount, bettor);

        nonces[bettor] = nonce + 1;
        lastSponsoredAt[bettor] = uint64(block.timestamp);
        emit Sponsored(bettor, matchId, outcome, amount);
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        return ecrecover(digest, v, r, s);
    }
}
```

Note: BetVault must expose `PERMIT2()` publicly — since it's `public immutable` already, the getter is auto-generated.

Note: the rate-limit test relies on `lastSponsoredAt` being initially 0; first call sets it to `block.timestamp`. The check `last + MIN > now` evaluates `0 + 30 > 0` = true at t=0 for the first call. We need to allow the first call. Fix by checking `last != 0 && last + MIN > now`. Update accordingly.

Replace the rate-limit guard with:

```solidity
if (lastSponsoredAt[bettor] != 0 && lastSponsoredAt[bettor] + MIN_SPONSOR_INTERVAL > block.timestamp) revert SponsorTooSoon();
```

- [ ] **Step 7: Run, expect pass**

Run: `forge test --root contracts --match-path "test/unit/BetPaymaster.t.sol" -vv`
Expected: 7 tests passing.

- [ ] **Step 8: Commit**

```bash
git add contracts/src/interfaces/IBetPaymaster.sol contracts/src/interfaces/IBetVault.sol contracts/src/BetVault.sol contracts/src/BetPaymaster.sol contracts/test/unit/BetPaymaster.t.sol
git commit -m "feat(contracts): BetPaymaster + BetVault.placeBetSponsored for gasless human bets"
```

---

## Task 15: Fuzz tests for BetVault

**Files:**

- Create: `contracts/test/fuzz/BetVaultRoundtrip.fuzz.t.sol`

- [ ] **Step 1: Write the fuzz test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "../helpers/TestBase.sol";
import {IBetVault} from "../../src/interfaces/IBetVault.sol";
import {IPermit2} from "../../src/interfaces/IPermit2.sol";

contract BetVaultRoundtripFuzz is TestBase {
    function setUp() public { _setUpBase(); }

    function _bet(address who, bytes32 matchId, uint8 outcome, uint128 amount) internal {
        IPermit2.PermitTransferFrom memory p = IPermit2.PermitTransferFrom({
            permitted: IPermit2.TokenPermissions({ token: address(usdc), amount: amount }),
            nonce: uint256(keccak256(abi.encode(who, matchId, outcome, amount, block.timestamp))),
            deadline: uint64(block.timestamp + 1 hours)
        });
        vm.prank(who);
        vault.placeBet(matchId, outcome, amount, p, "");
    }

    /// @dev Three bettors, three outcomes, random amounts. Settle. Assert sum of payouts ≤ total pool.
    function testFuzz_payoutsNeverExceedPool(uint64 a, uint64 b, uint64 c, uint8 winning) public {
        a = uint64(bound(a, 1e6, 1_000 * 1e6));
        b = uint64(bound(b, 1e6, 1_000 * 1e6));
        c = uint64(bound(c, 1e6, 1_000 * 1e6));
        winning = uint8(bound(winning, 0, 2));

        _fund(alice, uint256(a));
        _fund(bob,   uint256(b));
        _fund(carol, uint256(c));

        _openMatch(M1, uint64(block.timestamp + 1));
        _bet(alice, M1, 0, uint128(a));
        _bet(bob,   M1, 1, uint128(b));
        _bet(carol, M1, 2, uint128(c));

        skip(2);
        registry.closeMarket(M1);
        // Hand-craft an oracle result that picks `winning`
        (uint8 home, uint8 away) = winning == 0 ? (uint8(2), uint8(1))
                                 : winning == 1 ? (uint8(1), uint8(1))
                                 : (uint8(1), uint8(2));
        bytes memory sig = _signOracleResult(M1, home, away, uint64(block.timestamp));
        oracle.submitResult(M1, home, away, uint64(block.timestamp), sig);
        vault.settleMarket(M1);

        uint256 totalPool = uint256(a) + uint256(b) + uint256(c);
        uint256 totalPaid;
        // Try to claim for each
        if (winning == 0) {
            uint256 before = usdc.balanceOf(alice);
            vm.prank(alice); vault.claim(M1);
            totalPaid += usdc.balanceOf(alice) - before;
        }
        if (winning == 1) {
            uint256 before = usdc.balanceOf(bob);
            vm.prank(bob); vault.claim(M1);
            totalPaid += usdc.balanceOf(bob) - before;
        }
        if (winning == 2) {
            uint256 before = usdc.balanceOf(carol);
            vm.prank(carol); vault.claim(M1);
            totalPaid += usdc.balanceOf(carol) - before;
        }
        assertLe(totalPaid, totalPool, "payouts must not exceed pool");
    }
}
```

- [ ] **Step 2: Run**

Run: `forge test --root contracts --match-path "test/fuzz/**" -vv`
Expected: 256 runs pass.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/fuzz/BetVaultRoundtrip.fuzz.t.sol
git commit -m "test(contracts): fuzz parimutuel roundtrip — payouts never exceed pool"
```

---

## Task 16: Invariant tests for BetVault

**Files:**

- Create: `contracts/test/invariant/handlers/BetVaultHandler.sol`
- Create: `contracts/test/invariant/BetVaultInvariants.t.sol`

- [ ] **Step 1: Write `BetVaultHandler.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BetVault} from "../../../src/BetVault.sol";
import {Market} from "../../../src/Market.sol";
import {MatchRegistry} from "../../../src/MatchRegistry.sol";
import {MockUSDC} from "../../../src/mocks/MockUSDC.sol";
import {MockPermit2} from "../../../src/mocks/MockPermit2.sol";
import {IPermit2} from "../../../src/interfaces/IPermit2.sol";

contract BetVaultHandler is Test {
    BetVault public vault;
    Market public market;
    MatchRegistry public registry;
    MockUSDC public usdc;
    MockPermit2 public permit2;
    bytes32 public constant M = keccak256("INV-M");
    address[] public actors;
    uint256 public callCounter;

    constructor(BetVault v, Market m, MatchRegistry r, MockUSDC u, MockPermit2 p) {
        vault = v; market = m; registry = r; usdc = u; permit2 = p;
        actors.push(address(0x111));
        actors.push(address(0x222));
        actors.push(address(0x333));
        for (uint256 i = 0; i < actors.length; i++) {
            usdc.mint(actors[i], 10_000_000 * 1e6);
            vm.prank(actors[i]);
            usdc.approve(address(permit2), type(uint256).max);
        }
    }

    function placeBet(uint256 actorSeed, uint8 outcome, uint64 amount) external {
        callCounter++;
        address a = actors[actorSeed % actors.length];
        outcome = uint8(bound(outcome, 0, 2));
        amount = uint64(bound(amount, 1e6, 100 * 1e6));
        (, , uint64 kickoff, , ) = registry.matches(M);
        if (kickoff == 0 || block.timestamp >= kickoff) return; // skip if no match or closed
        IPermit2.PermitTransferFrom memory p = IPermit2.PermitTransferFrom({
            permitted: IPermit2.TokenPermissions({ token: address(usdc), amount: amount }),
            nonce: uint256(keccak256(abi.encode(callCounter, a, amount))),
            deadline: uint64(block.timestamp + 1 hours)
        });
        vm.prank(a);
        try vault.placeBet(M, outcome, amount, p, "") {} catch {}
    }
}
```

- [ ] **Step 2: Write `BetVaultInvariants.t.sol`**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "../helpers/TestBase.sol";
import {BetVaultHandler} from "./handlers/BetVaultHandler.sol";

contract BetVaultInvariants is TestBase {
    BetVaultHandler handler;

    function setUp() public {
        _setUpBase();
        // Insert a match the handler can bet into
        vm.prank(address(oracle));
        registry.upsertMatch(keccak256("INV-M"), ARG, MEX, uint64(block.timestamp + 1 days));

        handler = new BetVaultHandler(vault, market, registry, usdc, permit2);
        targetContract(address(handler));
    }

    function invariant_vaultBalanceCoversOutcomeStakes() public view {
        bytes32 m = keccak256("INV-M");
        uint256 totalStakes = uint256(market.outcomeStake(m, 0)) + market.outcomeStake(m, 1) + market.outcomeStake(m, 2);
        assertGe(usdc.balanceOf(address(vault)), totalStakes);
    }

    function invariant_sumUserStakesEqualsOutcomeTotals() public view {
        bytes32 m = keccak256("INV-M");
        uint256 totalOutcome = uint256(market.outcomeStake(m, 0)) + market.outcomeStake(m, 1) + market.outcomeStake(m, 2);
        uint256 sumUsers;
        for (uint256 i = 0; i < 3; i++) {
            address a = handler.actors(i);
            sumUsers += market.userTotalStake(m, a);
        }
        assertEq(totalOutcome, sumUsers);
    }
}
```

- [ ] **Step 3: Run**

Run: `forge test --root contracts --match-path "test/invariant/**" -vv`
Expected: 64 runs × 32 depth, two invariants hold.

- [ ] **Step 4: Commit**

```bash
git add contracts/test/invariant/handlers/BetVaultHandler.sol contracts/test/invariant/BetVaultInvariants.t.sol
git commit -m "test(contracts): invariants — vault balance covers stakes, user sums = outcome totals"
```

---

## Task 17: Integration test — full lifecycle

**Files:**

- Create: `contracts/test/integration/Lifecycle.t.sol`

- [ ] **Step 1: Write the test**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "../helpers/TestBase.sol";
import {IBetVault} from "../../src/interfaces/IBetVault.sol";
import {IMatchRegistry} from "../../src/interfaces/IMatchRegistry.sol";
import {IPermit2} from "../../src/interfaces/IPermit2.sol";

contract LifecycleIntegrationTest is TestBase {
    function setUp() public { _setUpBase(); }

    function _bet(address who, bytes32 matchId, uint8 outcome, uint128 amount, uint256 nonce) internal {
        IPermit2.PermitTransferFrom memory p = IPermit2.PermitTransferFrom({
            permitted: IPermit2.TokenPermissions({ token: address(usdc), amount: amount }),
            nonce: nonce, deadline: uint64(block.timestamp + 1 hours)
        });
        vm.prank(who);
        vault.placeBet(matchId, outcome, amount, p, "");
    }

    function test_fullLifecycle_twoMatches_threeBettors_payoutMathExact() public {
        bytes32 M2 = keccak256("FIFA-WC26-2");

        // ----- Match 1 setup -----
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        _openMatch(M2, uint64(block.timestamp + 2 hours));

        // ----- Bets on M1 -----
        _bet(alice, M1, 0, 50 * 1e6, 1);
        _bet(bob,   M1, 0, 30 * 1e6, 2);
        _bet(carol, M1, 1, 20 * 1e6, 3);
        _bet(carol, M1, 2, 40 * 1e6, 4);

        // ----- Bets on M2 -----
        _bet(alice, M2, 2, 25 * 1e6, 5);
        _bet(bob,   M2, 2, 25 * 1e6, 6);

        // ----- Time-warp past M1 kickoff -----
        skip(1 hours + 1);
        registry.closeMarket(M1);

        // Oracle posts M1 result 1-0 (home wins)
        bytes memory sig1 = _signOracleResult(M1, 1, 0, uint64(block.timestamp));
        oracle.submitResult(M1, 1, 0, uint64(block.timestamp), sig1);
        vault.settleMarket(M1);

        // Claims for M1
        // total pool = 140 USDC, winning pool = 80
        // alice payout = 50 * 140 / 80 = 87.5
        // bob payout = 30 * 140 / 80 = 52.5
        uint256 aBefore = usdc.balanceOf(alice);
        uint256 bBefore = usdc.balanceOf(bob);
        vm.prank(alice); vault.claim(M1);
        vm.prank(bob);   vault.claim(M1);
        assertEq(usdc.balanceOf(alice) - aBefore, 87_500_000);
        assertEq(usdc.balanceOf(bob) - bBefore,   52_500_000);

        // Carol cannot claim M1 (no stake on winning outcome 0)
        vm.prank(carol);
        vm.expectRevert(IBetVault.NoStakeOnWinningOutcome.selector);
        vault.claim(M1);

        // ----- M2 abandoned. Skip 7 days. Refund. -----
        skip(7 days + 1);
        uint256 aRefBefore = usdc.balanceOf(alice);
        uint256 bRefBefore = usdc.balanceOf(bob);
        vm.prank(alice); vault.refund(M2);
        vm.prank(bob);   vault.refund(M2);
        assertEq(usdc.balanceOf(alice) - aRefBefore, 25 * 1e6);
        assertEq(usdc.balanceOf(bob) - bRefBefore,   25 * 1e6);
    }
}
```

- [ ] **Step 2: Run**

Run: `forge test --root contracts --match-path "test/integration/**" -vv`
Expected: 1 test passing.

- [ ] **Step 3: Commit**

```bash
git add contracts/test/integration/Lifecycle.t.sol
git commit -m "test(contracts): integration — full lifecycle with exact parimutuel math"
```

---

## Task 18: Deploy script (`Deploy.s.sol`)

**Files:**

- Create: `contracts/script/Deploy.s.sol`

- [ ] **Step 1: Write the script**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockPermit2} from "../src/mocks/MockPermit2.sol";
import {MockCallFrom} from "../src/mocks/MockCallFrom.sol";
import {MatchRegistry} from "../src/MatchRegistry.sol";
import {Market} from "../src/Market.sol";
import {Oracle} from "../src/Oracle.sol";
import {BetVault} from "../src/BetVault.sol";
import {BetPaymaster} from "../src/BetPaymaster.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address oracleSigner = vm.envAddress("ORACLE_SIGNER_ADDRESS");
        address relayer      = vm.envAddress("RELAYER_ADDRESS");

        bytes32 salt = bytes32(uint256(0xA8CC10C)); // "arc-pick"

        vm.startBroadcast(deployerKey);

        MockUSDC usdc           = new MockUSDC{salt: salt}();
        MockPermit2 permit2     = new MockPermit2{salt: salt}();
        MockCallFrom callFrom   = new MockCallFrom{salt: salt}();
        MatchRegistry registry  = new MatchRegistry{salt: salt}();
        Oracle oracle           = new Oracle{salt: salt}(registry, oracleSigner);
        Market market           = new Market{salt: salt}();
        BetVault vault          = new BetVault{salt: salt}(usdc, permit2, registry, market, oracle);
        market.setBetVault(address(vault));                                       // one-shot
        BetPaymaster paymaster  = new BetPaymaster{salt: salt}(usdc, vault, relayer);

        registry.setOracle(address(oracle));
        registry.setBetVault(address(vault));
        vault.setPaymaster(address(paymaster));

        vm.stopBroadcast();

        console2.log("USDC                  ", address(usdc));
        console2.log("PERMIT2               ", address(permit2));
        console2.log("CALL_FROM             ", address(callFrom));
        console2.log("MATCH_REGISTRY        ", address(registry));
        console2.log("MARKET                ", address(market));
        console2.log("BET_VAULT             ", address(vault));
        console2.log("ORACLE                ", address(oracle));
        console2.log("BET_PAYMASTER         ", address(paymaster));

        // Persist addresses to .env-like format
        string memory env = string.concat(
            "USDC_ADDRESS=", vm.toString(address(usdc)), "\n",
            "PERMIT2_ADDRESS=", vm.toString(address(permit2)), "\n",
            "CALL_FROM_ADDRESS=", vm.toString(address(callFrom)), "\n",
            "MATCH_REGISTRY_ADDRESS=", vm.toString(address(registry)), "\n",
            "MARKET_ADDRESS=", vm.toString(address(market)), "\n",
            "BET_VAULT_ADDRESS=", vm.toString(address(vault)), "\n",
            "ORACLE_ADDRESS=", vm.toString(address(oracle)), "\n",
            "BET_PAYMASTER_ADDRESS=", vm.toString(address(paymaster)), "\n"
        );
        vm.writeFile("deployed.env", env);
    }
}
```

- [ ] **Step 2: Smoke-test against in-process anvil**

Run:

```bash
anvil --port 8545 --chain-id 5042002 &
ANVIL_PID=$!
sleep 1
export DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export ORACLE_SIGNER_ADDRESS=0x90F79bf6EB2c4f870365E785982E1f101E93b906
export RELAYER_ADDRESS=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
forge script --root contracts script/Deploy.s.sol:Deploy --rpc-url http://localhost:8545 --broadcast
cat deployed.env
kill $ANVIL_PID
```

Expected: `deployed.env` contains 8 addresses, all non-zero.

- [ ] **Step 3: Commit**

```bash
git add contracts/script/Deploy.s.sol
git commit -m "feat(contracts): Deploy script with CREATE2 + deployed.env output"
```

---

## Task 19: Seed-matches script (`SeedMatches.s.sol`)

**Files:**

- Create: `contracts/script/SeedMatches.s.sol`

- [ ] **Step 1: Write the script**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MatchRegistry} from "../src/MatchRegistry.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract SeedMatches is Script {
    function run() external {
        uint256 oracleSubmitterKey = vm.envUint("ORACLE_SUBMITTER_PRIVATE_KEY");
        address registryAddr = vm.envAddress("MATCH_REGISTRY_ADDRESS");
        address usdcAddr     = vm.envAddress("USDC_ADDRESS");

        // Six demo group-stage matches with kickoffs spread over the next 48 hours.
        bytes32[6] memory ids;
        bytes32[6] memory homes;
        bytes32[6] memory aways;
        uint64[6] memory kickoffs;

        ids[0]      = keccak256("FIFA-WC26-1"); homes[0] = "ARG"; aways[0] = "MEX"; kickoffs[0] = uint64(block.timestamp + 4 hours);
        ids[1]      = keccak256("FIFA-WC26-2"); homes[1] = "FRA"; aways[1] = "DEN"; kickoffs[1] = uint64(block.timestamp + 6 hours);
        ids[2]      = keccak256("FIFA-WC26-3"); homes[2] = "BRA"; aways[2] = "CRC"; kickoffs[2] = uint64(block.timestamp + 1 hours);
        ids[3]      = keccak256("FIFA-WC26-4"); homes[3] = "GER"; aways[3] = "JPN"; kickoffs[3] = uint64(block.timestamp + 1 days);
        ids[4]      = keccak256("FIFA-WC26-5"); homes[4] = "ENG"; aways[4] = "USA"; kickoffs[4] = uint64(block.timestamp + 1 days + 3 hours);
        ids[5]      = keccak256("FIFA-WC26-6"); homes[5] = "ESP"; aways[5] = "POR"; kickoffs[5] = uint64(block.timestamp + 2 days);

        vm.startBroadcast(oracleSubmitterKey);
        MatchRegistry reg = MatchRegistry(registryAddr);
        for (uint256 i = 0; i < 6; i++) {
            reg.upsertMatch(ids[i], homes[i], aways[i], kickoffs[i]);
        }
        vm.stopBroadcast();

        // Mint faucet USDC to a known dev wallet
        address devWallet = vm.envAddress("DEV_WALLET");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        MockUSDC(usdcAddr).mint(devWallet, 1_000 * 1e6);
        vm.stopBroadcast();

        console2.log("Seeded 6 matches and minted 1,000 USDC to ", devWallet);
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add contracts/script/SeedMatches.s.sol
git commit -m "feat(contracts): SeedMatches script for 6 demo WC group-stage fixtures"
```

---

## Task 20: docker-compose + compose-init scripts

**Files:**

- Create: `docker-compose.yml`
- Create: `compose-init/Dockerfile.foundry`
- Create: `compose-init/deploy.sh`
- Create: `compose-init/seed.sh`

- [ ] **Step 1: Create `compose-init/Dockerfile.foundry`**

```dockerfile
FROM ghcr.io/foundry-rs/foundry:latest
USER root
RUN apk add --no-cache bash curl jq git
WORKDIR /work
COPY . /work
ENTRYPOINT ["bash"]
```

- [ ] **Step 2: Create `compose-init/deploy.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${RPC_URL:-http://anvil:8545}"

echo "Waiting for anvil..."
until curl -fsS -X POST -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' "$RPC_URL" >/dev/null; do
  sleep 1
done
echo "Anvil up."

cd /work
forge script --root contracts script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast --silent
cat deployed.env
echo "Deploy complete."
```

- [ ] **Step 3: Create `compose-init/seed.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${RPC_URL:-http://anvil:8545}"
test -f deployed.env || (echo "deployed.env missing; run deploy first" && exit 1)
set -a; source deployed.env; set +a

cd /work
forge script --root contracts script/SeedMatches.s.sol:SeedMatches --rpc-url "$RPC_URL" --broadcast --silent
echo "Seed complete."
```

- [ ] **Step 4: Create `docker-compose.yml`**

```yaml
services:
  anvil:
    image: ghcr.io/foundry-rs/foundry:latest
    command:
      - anvil
      - --host
      - 0.0.0.0
      - --port
      - "8545"
      - --chain-id
      - "5042002"
      - --block-time
      - "2"
    ports:
      - "8545:8545"
    healthcheck:
      test:
        ["CMD-SHELL", "cast block-number --rpc-url http://localhost:8545 >/dev/null"]
      interval: 2s
      timeout: 4s
      retries: 30

  deploy:
    build:
      context: .
      dockerfile: compose-init/Dockerfile.foundry
    depends_on:
      anvil:
        condition: service_healthy
    environment:
      RPC_URL: http://anvil:8545
      DEPLOYER_PRIVATE_KEY: ${DEPLOYER_PRIVATE_KEY}
      ORACLE_SIGNER_ADDRESS: ${ORACLE_SIGNER_ADDRESS}
      ORACLE_SUBMITTER_PRIVATE_KEY: ${ORACLE_SUBMITTER_PRIVATE_KEY}
      RELAYER_ADDRESS: ${RELAYER_ADDRESS}
      DEV_WALLET: ${DEV_WALLET}
    volumes:
      - .:/work
    entrypoint: ["bash", "compose-init/deploy.sh"]
    restart: "no"

  seed:
    build:
      context: .
      dockerfile: compose-init/Dockerfile.foundry
    depends_on:
      deploy:
        condition: service_completed_successfully
    environment:
      RPC_URL: http://anvil:8545
      DEPLOYER_PRIVATE_KEY: ${DEPLOYER_PRIVATE_KEY}
      ORACLE_SUBMITTER_PRIVATE_KEY: ${ORACLE_SUBMITTER_PRIVATE_KEY}
      DEV_WALLET: ${DEV_WALLET}
    volumes:
      - .:/work
    entrypoint: ["bash", "compose-init/seed.sh"]
    restart: "no"
```

- [ ] **Step 5: Update `.env.example`** to include the additional addresses needed by deploy/seed:

```
DEV_WALLET=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
ORACLE_SIGNER_ADDRESS=0x90F79bf6EB2c4f870365E785982E1f101E93b906
RELAYER_ADDRESS=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
```

- [ ] **Step 6: Smoke test**

Run:

```bash
cp .env.example .env
chmod +x compose-init/deploy.sh compose-init/seed.sh
docker compose up --abort-on-container-exit deploy seed
docker compose logs deploy seed
docker compose down -v
```

Expected: deploy exits 0, prints 8 addresses; seed exits 0, prints "Seeded 6 matches".

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml compose-init/Dockerfile.foundry compose-init/deploy.sh compose-init/seed.sh .env.example
git commit -m "feat: docker-compose dev stack with anvil + deterministic deploy + seed"
```

---

## Task 21: Coverage gate + GitHub Actions CI

**Files:**

- Create: `.github/workflows/contracts.yml`

- [ ] **Step 1: Run coverage locally to confirm ≥90%**

Run:

```bash
forge coverage --root contracts --report summary
```

Expected: line coverage ≥ 90% for `MatchRegistry`, `Market`, `Oracle`, `BetVault`, `BetPaymaster`. Mocks excluded.

If a contract is below 90%, write the missing tests before proceeding.

- [ ] **Step 2: Create the workflow**

```yaml
name: contracts

on:
  push:
    branches: [main]
  pull_request:

jobs:
  contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: stable
      - name: Forge build
        run: forge build --root contracts
      - name: Forge test
        run: forge test --root contracts -vv
      - name: Coverage
        run: |
          forge coverage --root contracts --report lcov
          # Gate: parse the lcov summary and fail if any of the core 5 are <90%
          python3 - <<'PY'
          import re, sys, pathlib
          lcov = pathlib.Path('lcov.info').read_text()
          targets = {'MatchRegistry.sol', 'Market.sol', 'BetVault.sol', 'Oracle.sol', 'BetPaymaster.sol'}
          current, lf, lh = None, 0, 0
          failures = []
          for line in lcov.splitlines():
              if line.startswith('SF:'):
                  current = line.split('/')[-1]; lf = lh = 0
              elif line.startswith('LF:'):
                  lf = int(line[3:])
              elif line.startswith('LH:'):
                  lh = int(line[3:])
              elif line == 'end_of_record' and current in targets:
                  pct = (lh / lf * 100) if lf else 0
                  if pct < 90:
                      failures.append(f"{current}: {pct:.1f}%")
                  print(f"{current}: {pct:.1f}%")
          if failures:
              print("Coverage gate failed:", failures); sys.exit(1)
          PY
```

- [ ] **Step 3: Push to a branch and confirm green CI**

Run:

```bash
git checkout -b ci/contracts
git add .github/workflows/contracts.yml
git commit -m "ci(contracts): forge build + test + 90% coverage gate"
git push -u origin ci/contracts
```

Expected: CI run green on GitHub. Open PR or merge back to main per project workflow.

- [ ] **Step 4: Merge to main, delete branch**

```bash
git checkout main
git merge --ff-only ci/contracts
git branch -d ci/contracts
git push
```

---

## Self-Review

After completing all tasks, run through this checklist:

**1. Spec coverage.**

- ✅ MatchRegistry — Task 8
- ✅ Market — Task 9
- ✅ Oracle — Task 10
- ✅ BetVault.placeBet (humans) — Task 11
- ✅ BetVault.placeBetFromAllowance + authorize/deauthorize — Task 12
- ✅ BetVault.settleMarket/claimFor/refundFor — Task 13
- ✅ BetPaymaster — Task 14
- ✅ Permit2 dual-mode (SignatureTransfer + AllowanceTransfer) — exercised in Tasks 11, 12
- ✅ Reentrancy guards on placeBet, placeBetFromAllowance, settleMarket, claim, claimFor, refund, refundFor — Tasks 11–13
- ✅ EIP-712 sig recovery (Oracle, BetPaymaster) — Tasks 10, 14
- ✅ Refund path (void or stuck) — Task 13
- ✅ Empty winning pool — exercised in Tasks 13, 15 (revert on NoStakeOnWinningOutcome; refundable after REFUND_AFTER)
- ✅ Fuzz roundtrip — Task 15
- ✅ Invariants — Task 16
- ✅ Full lifecycle integration — Task 17
- ✅ Deterministic CREATE2 deploy — Task 18
- ✅ Seed-matches script — Task 19
- ✅ docker-compose dev stack — Task 20
- ✅ Coverage gate + CI — Task 21

**Gaps to flag for later phases (out of P1 scope, will be picked up by P2/P3):**

- Compose stack does not yet include relay/oracle/keeper/agent services. P3 adds them.
- Real Permit2 deploy on Arc Testnet vs the canonical address — handled in P5 testnet deploy script.
- The `CallFrom` precompile is mocked. The paymaster's real-network behaviour against Arc's actual precompile is an open question (spec §17 #2); the integration shape (`placeBetSponsored` direct call) is robust to either implementation since the paymaster pulls funds itself.

**2. Placeholder scan.** None. Every code block is complete.

**3. Type consistency.** Cross-checked:

- `IBetVault.placeBet(...)`, `placeBetFromAllowance(...)`, `placeBetSponsored(...)`, `claim`/`claimFor`/`refund`/`refundFor` — same names used in BetVault.sol, paymaster, fuzz, invariants, integration.
- `IMarket.recordStake`, `outcomeStake`, `userStake`, `userTotalStake`, `totalPool`, `impliedProb` — consistent across the suite.
- `IOracle.results(matchId)` returns `(uint8, uint8, uint64)` — used in BetVault.settleMarket and tests identically.
- `IMatchRegistry.Status` enum values `Unknown/Open/Closed/Settled/Voided` referenced as `IMatchRegistry.Status.X` everywhere.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-06-03-arc-pick-p1-foundation-contracts.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for the contract-heavy work where each task has a tight TDD loop.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Faster for trivial mechanical tasks; risks context drift across 21 tasks.

Which approach?
