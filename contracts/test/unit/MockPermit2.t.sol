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
