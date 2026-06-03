// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMarket} from "./interfaces/IMarket.sol";

contract Market is IMarket {
    address public betVault;
    bool private _vaultSet;
    error AlreadySet();
    mapping(bytes32 => uint128[3]) internal _outcomeStake;
    mapping(bytes32 => mapping(address => uint128[3])) internal _userStake;

    /// @notice One-shot setter that breaks the circular constructor dependency between
    ///         BetVault and Market. Called exactly once immediately after Market is
    ///         deployed and BetVault's address is known.
    function setBetVault(address vault) external {
        if (_vaultSet) revert AlreadySet();
        betVault = vault;
        _vaultSet = true;
    }

    function recordStake(bytes32 matchId, address user, uint8 outcome, uint128 amount) external {
        if (msg.sender != betVault) revert NotVault();
        if (outcome > 2) revert InvalidOutcome();
        _outcomeStake[matchId][outcome] += amount;
        _userStake[matchId][user][outcome] += amount;
        emit StakeRecorded(matchId, user, outcome, amount);
    }

    function outcomeStake(bytes32 matchId, uint8 outcome) external view returns (uint128) {
        return _outcomeStake[matchId][outcome];
    }

    function userStake(bytes32 matchId, address user, uint8 outcome) external view returns (uint128) {
        return _userStake[matchId][user][outcome];
    }

    function userTotalStake(bytes32 matchId, address user) external view returns (uint256) {
        uint128[3] storage u = _userStake[matchId][user];
        return uint256(u[0]) + u[1] + u[2];
    }

    function totalPool(bytes32 matchId) public view returns (uint256) {
        uint128[3] storage o = _outcomeStake[matchId];
        return uint256(o[0]) + o[1] + o[2];
    }

    function impliedProb(bytes32 matchId, uint8 outcome) external view returns (uint128 num, uint128 denom) {
        uint256 total = totalPool(matchId);
        if (total == 0) return (0, 0);
        return (_outcomeStake[matchId][outcome], uint128(total));
    }
}
