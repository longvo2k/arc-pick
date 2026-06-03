// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Mock of Arc's CallFrom precompile.
///
/// IMPORTANT: Solidity cannot actually spoof msg.sender. In production, Arc's precompile
/// does this at the EVM level. For unit tests of BetPaymaster, we use placeBetSponsored
/// (Task 14) — the paymaster passes bettor as an explicit parameter rather than relying
/// on spoofed sender. This mock just records the call path and forwards to the target.
contract MockCallFrom {
    struct Call { address impersonated; address target; bytes data; bool ok; }
    Call[] public calls;

    event CalledFrom(address indexed impersonated, address indexed target, bytes data);

    function callFrom(address impersonated, address target, bytes calldata data)
        external returns (bool)
    {
        (bool ok, bytes memory ret) = target.call(data);
        calls.push(Call({ impersonated: impersonated, target: target, data: data, ok: ok }));
        emit CalledFrom(impersonated, target, data);
        if (!ok) { assembly { revert(add(ret, 32), mload(ret)) } }
        return ok;
    }

    function callCount() external view returns (uint256) { return calls.length; }
    function lastCall() external view returns (Call memory) { return calls[calls.length - 1]; }
}
