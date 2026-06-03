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
