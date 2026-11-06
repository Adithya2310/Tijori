// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IGuardManager {
    function setGuard(address guard) external;
}

interface IVerifierRegistry {
    function setVerifier(address verifier) external;
}

/// @title One-time setup hook for guarded Tichori Safes.
/// @notice Called by Safe 1.4.1 `setup(..., to, data, ...)` via DELEGATECALL while the Safe is being
/// created, so the vault is never live without its presence guard and verifier.
contract TichoriSafeSetup {
    address private immutable self = address(this);

    error OnlyDelegateCall();

    function setupGuard(address guard, address verifier) external {
        if (address(this) == self) revert OnlyDelegateCall();
        // Runs in the Safe's context: these external self/guard calls have msg.sender == Safe.
        IGuardManager(address(this)).setGuard(guard);
        IVerifierRegistry(guard).setVerifier(verifier);
    }
}
