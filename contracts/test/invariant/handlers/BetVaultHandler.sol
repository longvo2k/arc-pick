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
        if (kickoff == 0 || block.timestamp >= kickoff) return;
        IPermit2.PermitTransferFrom memory p = IPermit2.PermitTransferFrom({
            permitted: IPermit2.TokenPermissions({ token: address(usdc), amount: amount }),
            nonce: uint256(keccak256(abi.encode(callCounter, a, amount))),
            deadline: uint64(block.timestamp + 1 hours)
        });
        vm.prank(a);
        try vault.placeBet(M, outcome, amount, p, "") {} catch {}
    }
}
