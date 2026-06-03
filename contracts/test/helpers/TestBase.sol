// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {MockPermit2} from "../../src/mocks/MockPermit2.sol";
import {MockCallFrom} from "../../src/mocks/MockCallFrom.sol";
import {MatchRegistry} from "../../src/MatchRegistry.sol";
import {Market} from "../../src/Market.sol";
import {Oracle} from "../../src/Oracle.sol";
import {BetVault} from "../../src/BetVault.sol";
import {IMatchRegistry} from "../../src/interfaces/IMatchRegistry.sol";

abstract contract TestBase is Test {
    MockUSDC internal usdc;
    MockPermit2 internal permit2;
    MockCallFrom internal callFrom;
    MatchRegistry internal registry;
    Market internal market;
    Oracle internal oracle;
    BetVault internal vault;

    uint256 internal signerKey = 0xA11CE;
    address internal signerAddr;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xC401);

    bytes32 internal constant M1 = keccak256("FIFA-WC26-1");
    bytes32 internal constant ARG = bytes32("ARG");
    bytes32 internal constant MEX = bytes32("MEX");

    function _setUpBase() internal {
        signerAddr = vm.addr(signerKey);
        usdc = new MockUSDC();
        permit2 = new MockPermit2();
        callFrom = new MockCallFrom();
        registry = new MatchRegistry();
        oracle = new Oracle(registry, signerAddr);
        market = new Market();
        vault = new BetVault(usdc, permit2, registry, market, oracle);
        market.setBetVault(address(vault));
        registry.setOracle(address(oracle));
        registry.setBetVault(address(vault));

        _fund(alice, 1_000 * 1e6);
        _fund(bob,   1_000 * 1e6);
        _fund(carol, 1_000 * 1e6);
    }

    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(permit2), type(uint256).max);
    }

    function _openMatch(bytes32 matchId, uint64 kickoff) internal {
        vm.prank(address(oracle));
        registry.upsertMatch(matchId, ARG, MEX, kickoff);
    }

    function _signOracleResult(bytes32 matchId, uint8 home, uint8 away, uint64 signedAt) internal view returns (bytes memory) {
        bytes32 typeHash = keccak256("Result(bytes32 matchId,uint8 homeScore,uint8 awayScore,uint64 signedAt,uint256 chainId)");
        bytes32 structHash = keccak256(abi.encode(typeHash, matchId, home, away, signedAt, block.chainid));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", oracle.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
