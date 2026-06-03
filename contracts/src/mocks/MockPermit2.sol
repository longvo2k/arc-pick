// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPermit2} from "../interfaces/IPermit2.sol";
import {IERC20} from "../interfaces/IERC20.sol";

/// @notice Mock Permit2 for unit tests. Skips EIP-712 sig verification; trusts callers.
/// DO NOT DEPLOY OUTSIDE TESTS.
contract MockPermit2 is IPermit2 {
    error NonceUsed();
    error Expired();
    error AllowanceExpired();
    error AllowanceInsufficient();

    struct Allowance { uint160 amount; uint48 expiration; uint48 nonce; }

    mapping(address => mapping(uint256 => bool)) public usedNonces; // owner => nonce => used
    mapping(address => mapping(address => mapping(address => Allowance))) internal _allowance; // owner => token => spender => allowance

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata /* signature */
    ) external {
        if (block.timestamp > permit.deadline) revert Expired();
        if (usedNonces[owner][permit.nonce]) revert NonceUsed();
        usedNonces[owner][permit.nonce] = true;
        require(transferDetails.requestedAmount <= permit.permitted.amount, "exceeds permit");
        require(IERC20(permit.permitted.token).transferFrom(owner, transferDetails.to, transferDetails.requestedAmount), "transfer failed");
    }

    function transferFrom(address from, address to, uint160 amount, address token) external {
        Allowance storage a = _allowance[from][token][msg.sender];
        if (a.expiration < block.timestamp) revert AllowanceExpired();
        if (a.amount < amount) revert AllowanceInsufficient();
        a.amount -= amount;
        require(IERC20(token).transferFrom(from, to, amount), "transfer failed");
    }

    function allowance(address user, address token, address spender)
        external view returns (uint160 amount, uint48 expiration, uint48 nonce)
    {
        Allowance storage a = _allowance[user][token][spender];
        return (a.amount, a.expiration, a.nonce);
    }

    function approve(address token, address spender, uint160 amount, uint48 expiration) external {
        Allowance storage a = _allowance[msg.sender][token][spender];
        a.amount = amount;
        a.expiration = expiration;
    }

    function lockdown(TokenSpenderPair[] calldata approvals) external {
        for (uint256 i = 0; i < approvals.length; i++) {
            delete _allowance[msg.sender][approvals[i].token][approvals[i].spender];
        }
    }
}
