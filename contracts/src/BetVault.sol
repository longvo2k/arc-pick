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

    // Stubs filled in by Tasks 12, 13, 14:
    function placeBetFromAllowance(bytes32, uint8, uint128, address) external pure { revert(); }
    function authorizeAgent(address) external pure { revert(); }
    function deauthorizeAgent(address) external pure { revert(); }
    function settleMarket(bytes32) external pure { revert(); }
    function claim(bytes32) external pure { revert(); }
    function claimFor(bytes32, address) external pure { revert(); }
    function refund(bytes32) external pure { revert(); }
    function refundFor(bytes32, address) external pure { revert(); }
}
