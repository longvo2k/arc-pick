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
