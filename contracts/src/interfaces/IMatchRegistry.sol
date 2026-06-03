// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMatchRegistry {
    enum Status { Unknown, Open, Closed, Settled, Voided }
    struct Match {
        bytes32 homeTeam;
        bytes32 awayTeam;
        uint64 kickoff;
        Status status;
        uint8 winningOutcome;
    }

    event MatchAdded(bytes32 indexed matchId, bytes32 homeTeam, bytes32 awayTeam, uint64 kickoff);
    event MatchRescheduled(bytes32 indexed matchId, uint64 oldKickoff, uint64 newKickoff);
    event MarketClosed(bytes32 indexed matchId);
    event MatchSettled(bytes32 indexed matchId, uint8 winningOutcome);
    event MatchVoided(bytes32 indexed matchId);
    event OracleUpdated(address indexed oracle);
    event BetVaultUpdated(address indexed betVault);

    error NotOracle();
    error NotBetVault();
    error AlreadyExists();
    error NotOpen();
    error TooEarly();
    error NotClosed();
    error AlreadySettled();
    error InvalidOutcome();
    error InvalidStatus();

    function upsertMatch(bytes32 matchId, bytes32 home, bytes32 away, uint64 kickoff) external;
    function closeMarket(bytes32 matchId) external;
    function markSettled(bytes32 matchId, uint8 winningOutcome) external;
    function voidMatch(bytes32 matchId) external;
    function matches(bytes32 matchId) external view returns (
        bytes32 homeTeam, bytes32 awayTeam, uint64 kickoff, Status status, uint8 winningOutcome
    );
    function setOracle(address oracle) external;
    function setBetVault(address betVault) external;
    function oracle() external view returns (address);
    function betVault() external view returns (address);
}
