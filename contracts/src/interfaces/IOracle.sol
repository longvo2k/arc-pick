// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOracle {
    struct Result { uint8 homeScore; uint8 awayScore; uint64 signedAt; }

    event ResultSubmitted(bytes32 indexed matchId, uint8 homeScore, uint8 awayScore, uint64 signedAt);
    event SignerUpdated(address indexed signer);
    event MatchVoided(bytes32 indexed matchId);

    error InvalidSignature();
    error AlreadySubmitted();
    error SignedAtInFuture();
    error SignedAtZero();

    function submitResult(bytes32 matchId, uint8 homeScore, uint8 awayScore, uint64 signedAt, bytes calldata sig) external;
    function voidMatch(bytes32 matchId) external;
    function setSigner(address newSigner) external;
    function results(bytes32 matchId) external view returns (uint8 homeScore, uint8 awayScore, uint64 signedAt);
    function signer() external view returns (address);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
