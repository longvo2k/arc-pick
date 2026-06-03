// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "../helpers/TestBase.sol";
import {IBetVault} from "../../src/interfaces/IBetVault.sol";

contract BetVaultAgentTest is TestBase {
    address ownerWallet = address(0xF00D);
    address agentKey = address(0xA9E47);

    function setUp() public {
        _setUpBase();
        _fund(ownerWallet, 1_000 * 1e6);
        // Owner authorizes the agent runtime key on BetVault
        vm.prank(ownerWallet);
        vault.authorizeAgent(agentKey);
        // Owner sets Permit2 allowance for BetVault as the spender
        vm.prank(ownerWallet);
        permit2.approve(address(usdc), address(vault), uint160(100 * 1e6), uint48(block.timestamp + 30 days));
    }

    function test_authorizeAgent_setsMapping() public view {
        assertTrue(vault.authorizedAgent(ownerWallet, agentKey));
    }

    function test_deauthorizeAgent_clearsMapping() public {
        vm.prank(ownerWallet);
        vault.deauthorizeAgent(agentKey);
        assertFalse(vault.authorizedAgent(ownerWallet, agentKey));
    }

    function test_placeBetFromAllowance_authorizedAgent_succeeds() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        vm.expectEmit(true, true, false, true);
        emit IBetVault.Placed(M1, ownerWallet, 1, 5 * 1e6);
        vm.prank(agentKey);
        vault.placeBetFromAllowance(M1, 1, 5 * 1e6, ownerWallet);
        assertEq(market.userStake(M1, ownerWallet, 1), 5 * 1e6);
        assertEq(usdc.balanceOf(address(vault)), 5 * 1e6);
    }

    function test_placeBetFromAllowance_unauthorizedReverts() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        vm.prank(address(0xDEAD));
        vm.expectRevert(IBetVault.NotAuthorizedAgent.selector);
        vault.placeBetFromAllowance(M1, 1, 1 * 1e6, ownerWallet);
    }

    function test_placeBetFromAllowance_revokedAgentReverts() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        vm.prank(ownerWallet);
        vault.deauthorizeAgent(agentKey);
        vm.prank(agentKey);
        vm.expectRevert(IBetVault.NotAuthorizedAgent.selector);
        vault.placeBetFromAllowance(M1, 1, 1 * 1e6, ownerWallet);
    }

    function test_placeBetFromAllowance_overCapReverts() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        vm.prank(agentKey);
        vm.expectRevert(); // MockPermit2.AllowanceInsufficient
        vault.placeBetFromAllowance(M1, 1, 200 * 1e6, ownerWallet);
    }

    function test_placeBetFromAllowance_afterKickoffReverts() public {
        _openMatch(M1, uint64(block.timestamp + 1));
        skip(2);
        vm.prank(agentKey);
        vm.expectRevert(IBetVault.KickoffPassed.selector);
        vault.placeBetFromAllowance(M1, 1, 1 * 1e6, ownerWallet);
    }
}
