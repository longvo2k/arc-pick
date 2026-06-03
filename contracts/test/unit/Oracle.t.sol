// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Oracle} from "../../src/Oracle.sol";
import {IOracle} from "../../src/interfaces/IOracle.sol";
import {MatchRegistry} from "../../src/MatchRegistry.sol";
import {IMatchRegistry} from "../../src/interfaces/IMatchRegistry.sol";

contract OracleTest is Test {
    Oracle oracle;
    MatchRegistry reg;
    uint256 signerKey;
    address signerAddr;

    bytes32 constant M = keccak256("M");

    function setUp() public {
        signerKey = 0xA11CE;
        signerAddr = vm.addr(signerKey);
        reg = new MatchRegistry();
        oracle = new Oracle(reg, signerAddr);
        reg.setOracle(address(oracle));
    }

    function _sign(bytes32 matchId, uint8 home, uint8 away, uint64 signedAt) internal view returns (bytes memory) {
        bytes32 typeHash = keccak256("Result(bytes32 matchId,uint8 homeScore,uint8 awayScore,uint64 signedAt,uint256 chainId)");
        bytes32 structHash = keccak256(abi.encode(typeHash, matchId, home, away, signedAt, block.chainid));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", oracle.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_submitResult_writesAndEmits() public {
        uint64 ts = uint64(block.timestamp);
        bytes memory sig = _sign(M, 2, 1, ts);
        vm.expectEmit(true, false, false, true);
        emit IOracle.ResultSubmitted(M, 2, 1, ts);
        oracle.submitResult(M, 2, 1, ts, sig);
        (uint8 h, uint8 a, uint64 at) = oracle.results(M);
        assertEq(h, 2); assertEq(a, 1); assertEq(at, ts);
    }

    function test_submitResult_rejectsBadSig() public {
        uint256 wrongKey = 0xDEAD;
        bytes32 typeHash = keccak256("Result(bytes32 matchId,uint8 homeScore,uint8 awayScore,uint64 signedAt,uint256 chainId)");
        bytes32 structHash = keccak256(abi.encode(typeHash, M, uint8(1), uint8(0), uint64(block.timestamp), block.chainid));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", oracle.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, digest);
        bytes memory bad = abi.encodePacked(r, s, v);
        vm.expectRevert(IOracle.InvalidSignature.selector);
        oracle.submitResult(M, 1, 0, uint64(block.timestamp), bad);
    }

    function test_submitResult_rejectsReplay() public {
        uint64 ts = uint64(block.timestamp);
        bytes memory sig = _sign(M, 2, 1, ts);
        oracle.submitResult(M, 2, 1, ts, sig);
        vm.expectRevert(IOracle.AlreadySubmitted.selector);
        oracle.submitResult(M, 2, 1, ts, sig);
    }

    function test_submitResult_rejectsZeroTimestamp() public {
        bytes memory sig = _sign(M, 0, 0, 0);
        vm.expectRevert(IOracle.SignedAtZero.selector);
        oracle.submitResult(M, 0, 0, 0, sig);
    }

    function test_submitResult_rejectsFutureTimestamp() public {
        uint64 future = uint64(block.timestamp + 100);
        bytes memory sig = _sign(M, 1, 0, future);
        vm.expectRevert(IOracle.SignedAtInFuture.selector);
        oracle.submitResult(M, 1, 0, future, sig);
    }

    function test_voidMatch_onlyOwner() public {
        vm.prank(address(0xB0B));
        vm.expectRevert();
        oracle.voidMatch(M);
    }

    function test_setSigner_onlyOwner() public {
        oracle.setSigner(address(0xD00D));
        assertEq(oracle.signer(), address(0xD00D));
    }
}
