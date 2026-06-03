// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./Ownable.sol";
import {IBetPaymaster} from "./interfaces/IBetPaymaster.sol";
import {IBetVault} from "./interfaces/IBetVault.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IPermit2} from "./interfaces/IPermit2.sol";

contract BetPaymaster is IBetPaymaster, Ownable {
    IERC20 public immutable USDC;
    IBetVault public immutable VAULT;
    IPermit2 public immutable PERMIT2;
    address public relayer;
    bytes32 public immutable DOMAIN_SEPARATOR;

    uint64 public constant MIN_SPONSOR_INTERVAL = 30;

    bytes32 public constant SPONSOR_TYPEHASH = keccak256(
        "SponsorBet(address bettor,bytes32 matchId,uint8 outcome,uint128 amount,uint256 nonce,uint64 deadline,uint256 chainId)"
    );

    mapping(address => uint256) public nonces;
    mapping(address => uint64) public lastSponsoredAt;

    constructor(IERC20 usdc_, IBetVault vault_, IPermit2 permit2_, address relayer_) {
        USDC = usdc_;
        VAULT = vault_;
        PERMIT2 = permit2_;
        relayer = relayer_;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("arc-pick BetPaymaster")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
        emit RelayerUpdated(relayer_);
    }

    function fund(uint256 amount) external {
        require(USDC.transferFrom(msg.sender, address(this), amount), "fund failed");
        emit PaymasterFunded(msg.sender, amount);
    }

    function withdraw(uint256 amount) external onlyOwner {
        require(USDC.transfer(msg.sender, amount), "withdraw failed");
        emit PaymasterWithdrew(msg.sender, amount);
    }

    function setRelayer(address newRelayer) external onlyOwner {
        relayer = newRelayer;
        emit RelayerUpdated(newRelayer);
    }

    function sponsorBet(
        address bettor,
        bytes32 matchId,
        uint8 outcome,
        uint128 amount,
        IPermit2.PermitTransferFrom calldata permit,
        bytes calldata permitSig,
        bytes calldata userSig,
        uint64 deadline
    ) external {
        if (msg.sender != relayer) revert NotRelayer();
        if (block.timestamp > deadline) revert SigExpired();
        if (lastSponsoredAt[bettor] != 0 && lastSponsoredAt[bettor] + MIN_SPONSOR_INTERVAL > block.timestamp) revert SponsorTooSoon();
        _verifyUserSig(bettor, matchId, outcome, amount, deadline, userSig);
        _executeSponsorPull(permit, permitSig, bettor, amount);
        VAULT.placeBetSponsored(matchId, outcome, amount, bettor);
        unchecked { nonces[bettor] += 1; }
        lastSponsoredAt[bettor] = uint64(block.timestamp);
        emit Sponsored(bettor, matchId, outcome, amount);
    }

    function _verifyUserSig(
        address bettor,
        bytes32 matchId,
        uint8 outcome,
        uint128 amount,
        uint64 deadline,
        bytes calldata userSig
    ) internal view {
        bytes32 structHash = keccak256(abi.encode(
            SPONSOR_TYPEHASH, bettor, matchId, outcome, amount, nonces[bettor], deadline, block.chainid
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address recovered = _recover(digest, userSig);
        if (recovered == address(0) || recovered != bettor) revert BadSig();
    }

    function _executeSponsorPull(
        IPermit2.PermitTransferFrom calldata permit,
        bytes calldata permitSig,
        address bettor,
        uint128 amount
    ) internal {
        PERMIT2.permitTransferFrom(
            permit,
            IPermit2.SignatureTransferDetails({ to: address(this), requestedAmount: amount }),
            bettor,
            permitSig
        );
        USDC.approve(address(VAULT), amount);
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        return ecrecover(digest, v, r, s);
    }
}
