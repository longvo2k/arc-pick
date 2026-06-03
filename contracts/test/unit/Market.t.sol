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
