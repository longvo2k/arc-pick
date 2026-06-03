// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMarket {
    event StakeRecorded(bytes32 indexed matchId, address indexed user, uint8 outcome, uint128 amount);
    error NotVault();
    error InvalidOutcome();

    function recordStake(bytes32 matchId, address user, uint8 outcome, uint128 amount) external;
    function outcomeStake(bytes32 matchId, uint8 outcome) external view returns (uint128);
    function userStake(bytes32 matchId, address user, uint8 outcome) external view returns (uint128);
    function userTotalStake(bytes32 matchId, address user) external view returns (uint256);
    function totalPool(bytes32 matchId) external view returns (uint256);
    function impliedProb(bytes32 matchId, uint8 outcome) external view returns (uint128 num, uint128 denom);
    function betVault() external view returns (address);
}
