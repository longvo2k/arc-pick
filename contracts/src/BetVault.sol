// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBetVault} from "./interfaces/IBetVault.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IPermit2} from "./interfaces/IPermit2.sol";
import {IMatchRegistry} from "./interfaces/IMatchRegistry.sol";
import {IMarket} from "./interfaces/IMarket.sol";
import {IOracle} from "./interfaces/IOracle.sol";

contract BetVault is IBetVault {
    IERC20 public immutable USDC;
    IPermit2 public immutable PERMIT2;
    IMatchRegistry public immutable REGISTRY;
    IMarket public immutable MARKET;
    IOracle public immutable ORACLE;

    uint64 public constant REFUND_AFTER = 7 days;

    mapping(bytes32 => mapping(address => bool)) public claimed;
    mapping(bytes32 => mapping(address => bool)) public refunded;
    mapping(address => mapping(address => bool)) public authorizedAgent;

    uint256 private _locked;
    modifier nonReentrant() {
        if (_locked != 0) revert Reentrancy();
        _locked = 1;
        _;
        _locked = 0;
    }

    constructor(IERC20 usdc_, IPermit2 permit2_, IMatchRegistry reg, IMarket m, IOracle o) {
        USDC = usdc_; PERMIT2 = permit2_; REGISTRY = reg; MARKET = m; ORACLE = o;
    }

    function placeBet(
        bytes32 matchId,
        uint8 outcome,
        uint128 amount,
        IPermit2.PermitTransferFrom calldata permit,
        bytes calldata sig
    ) external nonReentrant {
        _assertOpenPreKickoff(matchId);
        if (outcome > 2) revert InvalidOutcome();
        PERMIT2.permitTransferFrom(
            permit,
            IPermit2.SignatureTransferDetails({ to: address(this), requestedAmount: amount }),
            msg.sender,
            sig
        );
        MARKET.recordStake(matchId, msg.sender, outcome, amount);
        emit Placed(matchId, msg.sender, outcome, amount);
    }

    function _assertOpenPreKickoff(bytes32 matchId) internal view {
        (, , uint64 kickoff, IMatchRegistry.Status st, ) = REGISTRY.matches(matchId);
        if (st != IMatchRegistry.Status.Open) revert NotOpen();
        if (block.timestamp >= kickoff) revert KickoffPassed();
    }

    function authorizeAgent(address agent) external {
        authorizedAgent[msg.sender][agent] = true;
        emit AgentAuthorized(msg.sender, agent);
    }

    function deauthorizeAgent(address agent) external {
        authorizedAgent[msg.sender][agent] = false;
        emit AgentDeauthorized(msg.sender, agent);
    }

    function placeBetFromAllowance(
        bytes32 matchId,
        uint8 outcome,
        uint128 amount,
        address bettor
    ) external nonReentrant {
        if (!authorizedAgent[bettor][msg.sender]) revert NotAuthorizedAgent();
        _assertOpenPreKickoff(matchId);
        if (outcome > 2) revert InvalidOutcome();
        PERMIT2.transferFrom(bettor, address(this), uint160(amount), address(USDC));
        MARKET.recordStake(matchId, bettor, outcome, amount);
        emit Placed(matchId, bettor, outcome, amount);
    }

    function settleMarket(bytes32 matchId) external nonReentrant {
        (, , , IMatchRegistry.Status st, ) = REGISTRY.matches(matchId);
        if (st != IMatchRegistry.Status.Closed) revert NotClosed();
        (uint8 home, uint8 away, uint64 signedAt) = ORACLE.results(matchId);
        if (signedAt == 0) revert ResultNotPosted();
        uint8 outcome = home > away ? 0 : (home == away ? 1 : 2);
        REGISTRY.markSettled(matchId, outcome);
        emit Settled(matchId, outcome);
    }

    function claim(bytes32 matchId) external nonReentrant {
        _claim(matchId, msg.sender);
    }

    function claimFor(bytes32 matchId, address user) external nonReentrant {
        _claim(matchId, user);
    }

    function _claim(bytes32 matchId, address user) internal {
        (, , , IMatchRegistry.Status st, uint8 win) = REGISTRY.matches(matchId);
        if (st != IMatchRegistry.Status.Settled) revert NotSettled();
        if (claimed[matchId][user]) revert AlreadyClaimed();
        uint128 userStakeWin = MARKET.userStake(matchId, user, win);
        if (userStakeWin == 0) revert NoStakeOnWinningOutcome();
        uint256 winningPool = MARKET.outcomeStake(matchId, win);
        uint256 totalPool = MARKET.totalPool(matchId);
        uint256 payout = (uint256(userStakeWin) * totalPool) / winningPool;
        claimed[matchId][user] = true;
        require(USDC.transfer(user, payout), "transfer failed");
        emit Claimed(matchId, user, payout);
    }

    function refund(bytes32 matchId) external nonReentrant {
        _refund(matchId, msg.sender);
    }

    function refundFor(bytes32 matchId, address user) external nonReentrant {
        _refund(matchId, user);
    }

    function _refund(bytes32 matchId, address user) internal {
        (, , uint64 kickoff, IMatchRegistry.Status st, ) = REGISTRY.matches(matchId);
        bool eligible = (st == IMatchRegistry.Status.Voided) ||
                        (st != IMatchRegistry.Status.Settled && block.timestamp >= kickoff + REFUND_AFTER);
        if (!eligible) revert NotSettledOrVoided();
        if (refunded[matchId][user]) revert AlreadyRefunded();
        if (claimed[matchId][user]) revert AlreadyClaimed();
        uint256 amount = MARKET.userTotalStake(matchId, user);
        if (amount == 0) revert NoStake();
        refunded[matchId][user] = true;
        require(USDC.transfer(user, amount), "transfer failed");
        emit Refunded(matchId, user, amount);
    }
}
