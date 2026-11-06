// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {TichoriPresenceGuard} from "../src/TichoriPresenceGuard.sol";
import {TichoriSafeSetup} from "../src/TichoriSafeSetup.sol";

/// Deploys the presence guard and the Safe setup hook. Neither contract has an owner or admin.
/// forge script script/Deploy.s.sol --rpc-url whitechain_sepolia --account <keystore> --broadcast \
///   --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/
contract Deploy is Script {
    function run() external {
        require(block.chainid == 1874, "Whitechain Sepolia (1874) only");
        vm.startBroadcast();
        TichoriPresenceGuard guard = new TichoriPresenceGuard();
        TichoriSafeSetup setup = new TichoriSafeSetup();
        vm.stopBroadcast();
        console2.log("TIJORI_GUARD_ADDRESS=%s", address(guard));
        console2.log("TIJORI_SAFE_SETUP_ADDRESS=%s", address(setup));
    }
}
