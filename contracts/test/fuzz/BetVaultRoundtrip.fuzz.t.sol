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

    /// @dev Three bettors, three outcomes, random amounts. Settle. Assert total payout <= total pool.
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
        (uint8 home, uint8 away) = winning == 0 ? (uint8(2), uint8(1))
                                 : winning == 1 ? (uint8(1), uint8(1))
                                 : (uint8(1), uint8(2));
        bytes memory sig = _signOracleResult(M1, home, away, uint64(block.timestamp));
        oracle.submitResult(M1, home, away, uint64(block.timestamp), sig);
        vault.settleMarket(M1);

        uint256 totalPool = uint256(a) + uint256(b) + uint256(c);
        uint256 totalPaid;
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
