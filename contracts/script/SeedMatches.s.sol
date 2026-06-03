// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MatchRegistry} from "../src/MatchRegistry.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract SeedMatches is Script {
    function run() external {
        uint256 oracleSubmitterKey = vm.envUint("ORACLE_SUBMITTER_PRIVATE_KEY");
        address registryAddr = vm.envAddress("MATCH_REGISTRY_ADDRESS");
        address usdcAddr     = vm.envAddress("USDC_ADDRESS");

        // Six demo group-stage matches with kickoffs spread over the next 48 hours.
        bytes32[6] memory ids;
        bytes32[6] memory homes;
        bytes32[6] memory aways;
        uint64[6] memory kickoffs;

        ids[0] = keccak256("FIFA-WC26-1"); homes[0] = "ARG"; aways[0] = "MEX"; kickoffs[0] = uint64(block.timestamp + 4 hours);
        ids[1] = keccak256("FIFA-WC26-2"); homes[1] = "FRA"; aways[1] = "DEN"; kickoffs[1] = uint64(block.timestamp + 6 hours);
        ids[2] = keccak256("FIFA-WC26-3"); homes[2] = "BRA"; aways[2] = "CRC"; kickoffs[2] = uint64(block.timestamp + 1 hours);
        ids[3] = keccak256("FIFA-WC26-4"); homes[3] = "GER"; aways[3] = "JPN"; kickoffs[3] = uint64(block.timestamp + 1 days);
        ids[4] = keccak256("FIFA-WC26-5"); homes[4] = "ENG"; aways[4] = "USA"; kickoffs[4] = uint64(block.timestamp + 1 days + 3 hours);
        ids[5] = keccak256("FIFA-WC26-6"); homes[5] = "ESP"; aways[5] = "POR"; kickoffs[5] = uint64(block.timestamp + 2 days);

        vm.startBroadcast(oracleSubmitterKey);
        MatchRegistry reg = MatchRegistry(registryAddr);
        for (uint256 i = 0; i < 6; i++) {
            reg.upsertMatch(ids[i], homes[i], aways[i], kickoffs[i]);
        }
        vm.stopBroadcast();

        address devWallet = vm.envAddress("DEV_WALLET");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        MockUSDC(usdcAddr).mint(devWallet, 1_000 * 1e6);
        vm.stopBroadcast();

        console2.log("Seeded 6 matches and minted 1,000 USDC to ", devWallet);
    }
}
