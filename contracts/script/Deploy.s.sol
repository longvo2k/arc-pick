// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockPermit2} from "../src/mocks/MockPermit2.sol";
import {MockCallFrom} from "../src/mocks/MockCallFrom.sol";
import {MatchRegistry} from "../src/MatchRegistry.sol";
import {Market} from "../src/Market.sol";
import {Oracle} from "../src/Oracle.sol";
import {BetVault} from "../src/BetVault.sol";
import {BetPaymaster} from "../src/BetPaymaster.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address oracleSigner = vm.envAddress("ORACLE_SIGNER_ADDRESS");
        address relayer      = vm.envAddress("RELAYER_ADDRESS");

        bytes32 salt = bytes32(uint256(0xA8CC10C)); // "arc-pick"

        vm.startBroadcast(deployerKey);

        MockUSDC usdc           = new MockUSDC{salt: salt}();
        MockPermit2 permit2     = new MockPermit2{salt: salt}();
        MockCallFrom callFrom   = new MockCallFrom{salt: salt}();
        MatchRegistry registry  = new MatchRegistry{salt: salt}();
        Oracle oracle           = new Oracle{salt: salt}(registry, oracleSigner);
        Market market           = new Market{salt: salt}();
        BetVault vault          = new BetVault{salt: salt}(usdc, permit2, registry, market, oracle);
        market.setBetVault(address(vault));
        BetPaymaster paymaster  = new BetPaymaster{salt: salt}(usdc, vault, permit2, relayer);

        registry.setOracle(address(oracle));
        registry.setBetVault(address(vault));
        vault.setPaymaster(address(paymaster));

        vm.stopBroadcast();

        console2.log("USDC                  ", address(usdc));
        console2.log("PERMIT2               ", address(permit2));
        console2.log("CALL_FROM             ", address(callFrom));
        console2.log("MATCH_REGISTRY        ", address(registry));
        console2.log("MARKET                ", address(market));
        console2.log("BET_VAULT             ", address(vault));
        console2.log("ORACLE                ", address(oracle));
        console2.log("BET_PAYMASTER         ", address(paymaster));

        string memory env = string.concat(
            "USDC_ADDRESS=", vm.toString(address(usdc)), "\n",
            "PERMIT2_ADDRESS=", vm.toString(address(permit2)), "\n",
            "CALL_FROM_ADDRESS=", vm.toString(address(callFrom)), "\n",
            "MATCH_REGISTRY_ADDRESS=", vm.toString(address(registry)), "\n",
            "MARKET_ADDRESS=", vm.toString(address(market)), "\n",
            "BET_VAULT_ADDRESS=", vm.toString(address(vault)), "\n",
            "ORACLE_ADDRESS=", vm.toString(address(oracle)), "\n",
            "BET_PAYMASTER_ADDRESS=", vm.toString(address(paymaster)), "\n"
        );
        vm.writeFile("deployed.env", env);
    }
}
