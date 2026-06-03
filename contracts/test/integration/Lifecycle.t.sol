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

        // ----- Match setup -----
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
        // total pool = 140 USDC, winning pool = 80 USDC
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

        // ----- M2 abandoned. Skip past M2 kickoff + REFUND_AFTER. -----
        // M2 kickoff was at original_now + 2h. REFUND_AFTER = 7 days.
        // We're at original_now + 1h+1s after settling M1. Need to reach >= original_now + 7d + 2h.
        skip(7 days + 1 hours + 1);
        uint256 aRefBefore = usdc.balanceOf(alice);
        uint256 bRefBefore = usdc.balanceOf(bob);
        vm.prank(alice); vault.refund(M2);
        vm.prank(bob);   vault.refund(M2);
        assertEq(usdc.balanceOf(alice) - aRefBefore, 25 * 1e6);
        assertEq(usdc.balanceOf(bob) - bRefBefore,   25 * 1e6);
    }
}
