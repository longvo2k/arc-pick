// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "../helpers/TestBase.sol";
import {BetVaultHandler} from "./handlers/BetVaultHandler.sol";

contract BetVaultInvariants is TestBase {
    BetVaultHandler handler;

    function setUp() public {
        _setUpBase();
        vm.prank(address(oracle));
        registry.upsertMatch(keccak256("INV-M"), ARG, MEX, uint64(block.timestamp + 1 days));

        handler = new BetVaultHandler(vault, market, registry, usdc, permit2);
        targetContract(address(handler));
    }

    function invariant_vaultBalanceCoversOutcomeStakes() public view {
        bytes32 m = keccak256("INV-M");
        uint256 totalStakes = uint256(market.outcomeStake(m, 0))
                            + market.outcomeStake(m, 1)
                            + market.outcomeStake(m, 2);
        assertGe(usdc.balanceOf(address(vault)), totalStakes);
    }

    function invariant_sumUserStakesEqualsOutcomeTotals() public view {
        bytes32 m = keccak256("INV-M");
        uint256 totalOutcome = uint256(market.outcomeStake(m, 0))
                             + market.outcomeStake(m, 1)
                             + market.outcomeStake(m, 2);
        uint256 sumUsers;
        for (uint256 i = 0; i < 3; i++) {
            address a = handler.actors(i);
            sumUsers += market.userTotalStake(m, a);
        }
        assertEq(totalOutcome, sumUsers);
    }
}
