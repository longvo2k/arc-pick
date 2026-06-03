// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./Ownable.sol";
import {IOracle} from "./interfaces/IOracle.sol";
import {IMatchRegistry} from "./interfaces/IMatchRegistry.sol";

contract Oracle is IOracle, Ownable {
    IMatchRegistry public immutable REGISTRY;
    address public signer;
    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 public constant RESULT_TYPEHASH = keccak256(
        "Result(bytes32 matchId,uint8 homeScore,uint8 awayScore,uint64 signedAt,uint256 chainId)"
    );

    mapping(bytes32 => Result) internal _results;

    constructor(IMatchRegistry registry, address initialSigner) {
        REGISTRY = registry;
        signer = initialSigner;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("arc-pick Oracle")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
        emit SignerUpdated(initialSigner);
    }

    function results(bytes32 matchId) external view returns (uint8, uint8, uint64) {
        Result storage r = _results[matchId];
        return (r.homeScore, r.awayScore, r.signedAt);
    }

    function submitResult(bytes32 matchId, uint8 homeScore, uint8 awayScore, uint64 signedAt, bytes calldata sig) external {
        if (signedAt == 0) revert SignedAtZero();
        if (signedAt > block.timestamp) revert SignedAtInFuture();
        if (_results[matchId].signedAt != 0) revert AlreadySubmitted();

        bytes32 structHash = keccak256(abi.encode(RESULT_TYPEHASH, matchId, homeScore, awayScore, signedAt, block.chainid));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address recovered = _recover(digest, sig);
        if (recovered != signer) revert InvalidSignature();

        _results[matchId] = Result({ homeScore: homeScore, awayScore: awayScore, signedAt: signedAt });
        emit ResultSubmitted(matchId, homeScore, awayScore, signedAt);
    }

    function voidMatch(bytes32 matchId) external onlyOwner {
        REGISTRY.voidMatch(matchId);
        emit MatchVoided(matchId);
    }

    function setSigner(address newSigner) external onlyOwner {
        signer = newSigner;
        emit SignerUpdated(newSigner);
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        return ecrecover(digest, v, r, s);
    }
}
