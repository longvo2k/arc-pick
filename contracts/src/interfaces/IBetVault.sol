// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPermit2} from "./IPermit2.sol";

interface IBetVault {
    event Placed(bytes32 indexed matchId, address indexed bettor, uint8 outcome, uint128 amount);
    event Settled(bytes32 indexed matchId, uint8 winningOutcome);
    event Claimed(bytes32 indexed matchId, address indexed user, uint256 payout);
    event Refunded(bytes32 indexed matchId, address indexed user, uint256 amount);
    event AgentAuthorized(address indexed owner, address indexed agent);
    event AgentDeauthorized(address indexed owner, address indexed agent);

    error NotOpen();
    error KickoffPassed();
    error NotClosed();
    error NotSettled();
    error NotSettledOrVoided();
    error AlreadyClaimed();
    error AlreadyRefunded();
    error NoStakeOnWinningOutcome();
    error NoStake();
    error TooEarlyForRefund();
    error NotAuthorizedAgent();
    error InvalidOutcome();
    error ResultNotPosted();
    error Reentrancy();

    function placeBet(
        bytes32 matchId,
        uint8 outcome,
        uint128 amount,
        IPermit2.PermitTransferFrom calldata permit,
        bytes calldata sig
    ) external;

    function placeBetFromAllowance(bytes32 matchId, uint8 outcome, uint128 amount, address bettor) external;
    function authorizeAgent(address agent) external;
    function deauthorizeAgent(address agent) external;
    function authorizedAgent(address owner, address agent) external view returns (bool);

    function settleMarket(bytes32 matchId) external;
    function claim(bytes32 matchId) external;
    function claimFor(bytes32 matchId, address user) external;
    function refund(bytes32 matchId) external;
    function refundFor(bytes32 matchId, address user) external;

    function claimed(bytes32 matchId, address user) external view returns (bool);
    function refunded(bytes32 matchId, address user) external view returns (bool);
}
