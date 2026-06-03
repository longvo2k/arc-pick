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
        _bet(alice, M1, 0, 60 * 1e6);
        _bet(bob,   M1, 0, 40 * 1e6);
        _bet(carol, M1, 2, 50 * 1e6);
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
        registry.voidMatch(M1);
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
