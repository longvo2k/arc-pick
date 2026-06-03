// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./Ownable.sol";
import {IMatchRegistry} from "./interfaces/IMatchRegistry.sol";

contract MatchRegistry is IMatchRegistry, Ownable {
    address public oracle;
    address public betVault;
    mapping(bytes32 => Match) internal _matches;

    function matches(bytes32 matchId) external view returns (
        bytes32 homeTeam, bytes32 awayTeam, uint64 kickoff, Status status, uint8 winningOutcome
    ) {
        Match storage m = _matches[matchId];
        return (m.homeTeam, m.awayTeam, m.kickoff, m.status, m.winningOutcome);
    }

    function setOracle(address newOracle) external onlyOwner {
        oracle = newOracle;
        emit OracleUpdated(newOracle);
    }

    function setBetVault(address newVault) external onlyOwner {
        betVault = newVault;
        emit BetVaultUpdated(newVault);
    }

    function upsertMatch(bytes32 matchId, bytes32 home, bytes32 away, uint64 kickoff) external {
        if (msg.sender != oracle) revert NotOracle();
        Match storage m = _matches[matchId];
        if (m.status == Status.Unknown) {
            m.homeTeam = home;
            m.awayTeam = away;
            m.kickoff = kickoff;
            m.status = Status.Open;
            emit MatchAdded(matchId, home, away, kickoff);
        } else if (m.status == Status.Open) {
            uint64 old = m.kickoff;
            m.kickoff = kickoff;
            emit MatchRescheduled(matchId, old, kickoff);
        } else {
            revert NotOpen();
        }
    }

    function closeMarket(bytes32 matchId) external {
        Match storage m = _matches[matchId];
        if (m.status != Status.Open) revert NotOpen();
        if (block.timestamp < m.kickoff) revert TooEarly();
        m.status = Status.Closed;
        emit MarketClosed(matchId);
    }

    function markSettled(bytes32 matchId, uint8 winningOutcome) external {
        if (msg.sender != betVault) revert NotBetVault();
        if (winningOutcome > 2) revert InvalidOutcome();
        Match storage m = _matches[matchId];
        if (m.status == Status.Settled) revert AlreadySettled();
        if (m.status != Status.Closed) revert NotClosed();
        m.status = Status.Settled;
        m.winningOutcome = winningOutcome;
        emit MatchSettled(matchId, winningOutcome);
    }

    function voidMatch(bytes32 matchId) external {
        if (msg.sender != oracle) revert NotOracle();
        Match storage m = _matches[matchId];
        if (m.status == Status.Settled || m.status == Status.Voided) revert InvalidStatus();
        m.status = Status.Voided;
        emit MatchVoided(matchId);
    }
}
