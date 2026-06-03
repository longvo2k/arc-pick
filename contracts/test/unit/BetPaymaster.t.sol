// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "../helpers/TestBase.sol";
import {BetPaymaster} from "../../src/BetPaymaster.sol";
import {IBetPaymaster} from "../../src/interfaces/IBetPaymaster.sol";
import {IPermit2} from "../../src/interfaces/IPermit2.sol";

contract BetPaymasterTest is TestBase {
    BetPaymaster paymaster;
    uint256 bettorKey = 0xB377;
    address bettorAddr;
    address relayer = address(0x9E1A1);

    function setUp() public {
        _setUpBase();
        bettorAddr = vm.addr(bettorKey);
        paymaster = new BetPaymaster(usdc, vault, permit2, relayer);
        vault.setPaymaster(address(paymaster));
        _fund(bettorAddr, 1_000 * 1e6);
        usdc.mint(address(this), 1_000 * 1e6);
        usdc.approve(address(paymaster), type(uint256).max);
        paymaster.fund(1_000 * 1e6);
    }

    function _signSponsor(bytes32 matchId, uint8 outcome, uint128 amount, uint256 nonce, uint64 deadline) internal view returns (bytes memory) {
        bytes32 typeHash = keccak256("SponsorBet(address bettor,bytes32 matchId,uint8 outcome,uint128 amount,uint256 nonce,uint64 deadline,uint256 chainId)");
        bytes32 structHash = keccak256(abi.encode(typeHash, bettorAddr, matchId, outcome, amount, nonce, deadline, block.chainid));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", paymaster.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bettorKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _permit(uint128 amount, uint256 nonce, uint64 deadline) internal view returns (IPermit2.PermitTransferFrom memory) {
        return IPermit2.PermitTransferFrom({
            permitted: IPermit2.TokenPermissions({ token: address(usdc), amount: amount }),
            nonce: nonce, deadline: deadline
        });
    }

    function test_sponsorBet_happyPath() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p = _permit(5 * 1e6, 99, uint64(block.timestamp + 1 hours));
        bytes memory userSig = _signSponsor(M1, 0, 5 * 1e6, 0, uint64(block.timestamp + 1 hours));
        vm.prank(relayer);
        paymaster.sponsorBet(bettorAddr, M1, 0, 5 * 1e6, p, "", userSig, uint64(block.timestamp + 1 hours));
        assertEq(market.userStake(M1, bettorAddr, 0), 5 * 1e6);
    }

    function test_sponsorBet_revertsForNonRelayer() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p = _permit(1 * 1e6, 1, uint64(block.timestamp + 1 hours));
        bytes memory userSig = _signSponsor(M1, 0, 1 * 1e6, 0, uint64(block.timestamp + 1 hours));
        vm.expectRevert(IBetPaymaster.NotRelayer.selector);
        paymaster.sponsorBet(bettorAddr, M1, 0, 1 * 1e6, p, "", userSig, uint64(block.timestamp + 1 hours));
    }

    function test_sponsorBet_revertsOnDeadlineExpired() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p = _permit(1 * 1e6, 1, uint64(block.timestamp + 1 hours));
        // skip ahead so block.timestamp > 1
        vm.warp(block.timestamp + 100);
        bytes memory userSig = _signSponsor(M1, 0, 1 * 1e6, 0, uint64(block.timestamp - 1));
        vm.prank(relayer);
        vm.expectRevert(IBetPaymaster.SigExpired.selector);
        paymaster.sponsorBet(bettorAddr, M1, 0, 1 * 1e6, p, "", userSig, uint64(block.timestamp - 1));
    }

    function test_sponsorBet_revertsOnBadSig() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p = _permit(1 * 1e6, 1, uint64(block.timestamp + 1 hours));
        bytes memory badSig = abi.encodePacked(bytes32(0), bytes32(0), uint8(27));
        vm.prank(relayer);
        vm.expectRevert(IBetPaymaster.BadSig.selector);
        paymaster.sponsorBet(bettorAddr, M1, 0, 1 * 1e6, p, "", badSig, uint64(block.timestamp + 1 hours));
    }

    function test_sponsorBet_revertsOnReplay() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p = _permit(1 * 1e6, 1, uint64(block.timestamp + 1 hours));
        bytes memory userSig = _signSponsor(M1, 0, 1 * 1e6, 0, uint64(block.timestamp + 1 hours));
        vm.startPrank(relayer);
        paymaster.sponsorBet(bettorAddr, M1, 0, 1 * 1e6, p, "", userSig, uint64(block.timestamp + 1 hours));
        // skip past rate-limit window so the second call surfaces the nonce/sig check
        vm.warp(block.timestamp + 100);
        IPermit2.PermitTransferFrom memory p2 = _permit(1 * 1e6, 2, uint64(block.timestamp + 1 hours));
        vm.expectRevert(IBetPaymaster.BadSig.selector);
        paymaster.sponsorBet(bettorAddr, M1, 0, 1 * 1e6, p2, "", userSig, uint64(block.timestamp + 1 hours));
        vm.stopPrank();
    }

    function test_sponsorBet_rateLimitedPerBettor() public {
        _openMatch(M1, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p1 = _permit(1 * 1e6, 11, uint64(block.timestamp + 1 hours));
        bytes memory userSig1 = _signSponsor(M1, 0, 1 * 1e6, 0, uint64(block.timestamp + 1 hours));
        vm.prank(relayer);
        paymaster.sponsorBet(bettorAddr, M1, 0, 1 * 1e6, p1, "", userSig1, uint64(block.timestamp + 1 hours));
        bytes32 M2 = keccak256("FIFA-WC26-2");
        _openMatch(M2, uint64(block.timestamp + 1 hours));
        IPermit2.PermitTransferFrom memory p2 = _permit(1 * 1e6, 12, uint64(block.timestamp + 1 hours));
        bytes memory userSig2 = _signSponsor(M2, 0, 1 * 1e6, 1, uint64(block.timestamp + 1 hours));
        vm.prank(relayer);
        vm.expectRevert(IBetPaymaster.SponsorTooSoon.selector);
        paymaster.sponsorBet(bettorAddr, M2, 0, 1 * 1e6, p2, "", userSig2, uint64(block.timestamp + 1 hours));
    }

    function test_withdraw_onlyOwner() public {
        vm.prank(address(0xB0B));
        vm.expectRevert();
        paymaster.withdraw(1);
    }
}
