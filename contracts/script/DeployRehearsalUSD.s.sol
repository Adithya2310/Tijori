// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {RehearsalUSD} from "../src/rehearsal/RehearsalUSD.sol";

/// Deploys the testnet-only rehearsal token and mints MINT_AMOUNT (6 decimals, default 1,000,000) to MINT_TO.
/// MINT_TO=0x... forge script script/DeployRehearsalUSD.s.sol --rpc-url whitechain_sepolia --account <keystore> --broadcast
contract DeployRehearsalUSD is Script {
    function run() external {
        require(block.chainid == 1874, "Whitechain Sepolia (1874) only");
        address mintTo = vm.envAddress("MINT_TO");
        uint256 amount = vm.envOr("MINT_AMOUNT", uint256(1_000_000e6));
        vm.startBroadcast();
        RehearsalUSD token = new RehearsalUSD();
        token.mint(mintTo, amount);
        vm.stopBroadcast();
        console2.log("TICHORI_REHEARSAL_TOKEN_ADDRESS=%s", address(token));
    }
}
