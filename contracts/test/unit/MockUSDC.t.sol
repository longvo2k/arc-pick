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
