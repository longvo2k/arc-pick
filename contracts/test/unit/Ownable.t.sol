// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "../../src/Ownable.sol";

contract OwnedConsumer is Ownable {
    uint256 public x;
    function setX(uint256 v) external onlyOwner { x = v; }
}

contract OwnableTest is Test {
    OwnedConsumer c;
    address owner = address(0xA11CE);
    address other = address(0xB0B);

    function setUp() public {
        vm.prank(owner);
        c = new OwnedConsumer();
    }

    function test_owner_isDeployer() public view {
        assertEq(c.owner(), owner);
    }

    function test_onlyOwner_allowsOwner() public {
        vm.prank(owner);
        c.setX(7);
        assertEq(c.x(), 7);
    }

    function test_onlyOwner_rejectsOther() public {
        vm.prank(other);
        vm.expectRevert(Ownable.NotOwner.selector);
        c.setX(7);
    }

    function test_transferOwnership() public {
        vm.prank(owner);
        c.transferOwnership(other);
        assertEq(c.owner(), other);
        vm.prank(other);
        c.setX(9);
        assertEq(c.x(), 9);
    }

    function test_transferOwnership_onlyOwner() public {
        vm.prank(other);
        vm.expectRevert(Ownable.NotOwner.selector);
        c.transferOwnership(other);
    }
}
