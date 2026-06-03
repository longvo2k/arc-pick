// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPermit2} from "./IPermit2.sol";

interface IBetPaymaster {
    event Sponsored(address indexed bettor, bytes32 indexed matchId, uint8 outcome, uint128 amount);
    event PaymasterFunded(address indexed funder, uint256 amount);
    event PaymasterWithdrew(address indexed to, uint256 amount);
    event RelayerUpdated(address indexed relayer);

    error NotRelayer();
    error SigExpired();
    error NonceUsed();
    error SponsorTooSoon();
    error BadSig();

    function fund(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function setRelayer(address relayer) external;
    function sponsorBet(
        address bettor,
        bytes32 matchId,
        uint8 outcome,
        uint128 amount,
        IPermit2.PermitTransferFrom calldata permit,
        bytes calldata permitSig,
        bytes calldata userSig,
        uint64 deadline
    ) external;
    function nonces(address bettor) external view returns (uint256);
    function lastSponsoredAt(address bettor) external view returns (uint64);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
