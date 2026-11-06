// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {TichoriPresenceGuard, ISafe, Operation} from "../src/TichoriPresenceGuard.sol";
import {TichoriSafeSetup} from "../src/TichoriSafeSetup.sol";
import {MockUSDT} from "./mocks/MockUSDT.sol";

interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce) external returns (address);
}

/// @dev Runs against the exact canonical Safe 1.4.1 runtime bytecode read from Whitechain Sepolia,
/// etched at the canonical addresses, so no network access is needed.
contract TichoriPresenceGuardTest is Test {
    bytes32 constant GUARD_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;
    address constant FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    address constant SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    address constant HANDLER = 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99;

    TichoriPresenceGuard guard;
    TichoriSafeSetup setup;
    MockUSDT usdt;
    ISafe safe;
    uint256[] ownerKeys; // sorted by address
    address[] owners;
    uint256 verifierKey = 0xA11CE;
    address relayer = makeAddr("relayer");
    address vendor = makeAddr("vendor");

    function setUp() public {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/safe-1.4.1.json"));
        vm.etch(FACTORY, vm.parseJsonBytes(json, ".factory.code"));
        vm.etch(SINGLETON, vm.parseJsonBytes(json, ".singletonL2.code"));
        vm.etch(HANDLER, vm.parseJsonBytes(json, ".fallbackHandler.code"));
        guard = new TichoriPresenceGuard();
        setup = new TichoriSafeSetup();
        usdt = new MockUSDT();

        uint256[5] memory keys = [uint256(0xB0B), 0xCA7, 0xD06, 0xE11, 0xF0F];
        for (uint256 i; i < keys.length; ++i) {
            ownerKeys.push(keys[i]);
        }
        // Sort keys by address (insertion sort, 5 items).
        for (uint256 i = 1; i < ownerKeys.length; ++i) {
            uint256 k = ownerKeys[i];
            uint256 j = i;
            while (j > 0 && vm.addr(ownerKeys[j - 1]) > vm.addr(k)) {
                ownerKeys[j] = ownerKeys[j - 1];
                --j;
            }
            ownerKeys[j] = k;
        }
        for (uint256 i; i < ownerKeys.length; ++i) {
            owners.push(vm.addr(ownerKeys[i]));
        }
        safe = _deploySafe(owners, 3, 1);
        usdt.mint(address(safe), 10_000e6);
    }

    function _deploySafe(address[] memory safeOwners, uint256 threshold, uint256 salt) internal returns (ISafe) {
        bytes memory initializer = abi.encodeWithSignature(
            "setup(address[],uint256,address,bytes,address,address,uint256,address)",
            safeOwners,
            threshold,
            address(setup),
            abi.encodeCall(TichoriSafeSetup.setupGuard, (address(guard), vm.addr(verifierKey))),
            HANDLER,
            address(0),
            0,
            address(0)
        );
        return ISafe(ISafeProxyFactory(FACTORY).createProxyWithNonce(SINGLETON, initializer, salt));
    }

    function _payout(uint256 amount) internal view returns (TichoriPresenceGuard.SafeTx memory t) {
        t = TichoriPresenceGuard.SafeTx({
            to: address(usdt),
            value: 0,
            data: abi.encodeCall(MockUSDT.transfer, (vendor, amount)),
            operation: Operation.Call,
            safeTxGas: 100_000,
            baseGas: 60_000,
            gasPrice: 1, // 1 micro-USDT per gas, paid by the vault to the relayer
            gasToken: address(usdt),
            refundReceiver: payable(relayer)
        });
    }

    function _hash(TichoriPresenceGuard.SafeTx memory t) internal view returns (bytes32) {
        return safe.getTransactionHash(
            t.to, t.value, t.data, t.operation, t.safeTxGas, t.baseGas, t.gasPrice, t.gasToken, t.refundReceiver, safe.nonce()
        );
    }

    /// @dev Signatures from ownerKeys at the given (ascending) indexes.
    function _sign(bytes32 hash, uint256[] memory indexes) internal view returns (bytes memory sigs) {
        for (uint256 i; i < indexes.length; ++i) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKeys[indexes[i]], hash);
            sigs = bytes.concat(sigs, abi.encodePacked(r, s, v));
        }
    }

    function _attest(bytes32 safeTxHash, uint256[] memory indexes, uint64 expiresAt, uint256 signerKey)
        internal
        view
        returns (TichoriPresenceGuard.Attestation memory a, bytes memory sig)
    {
        address[] memory approvers = new address[](indexes.length);
        for (uint256 i; i < indexes.length; ++i) {
            approvers[i] = owners[indexes[i]];
        }
        a = TichoriPresenceGuard.Attestation({
            safe: address(safe),
            safeTxHash: safeTxHash,
            sessionId: keccak256("session-1"),
            approvers: approvers,
            ref: keccak256("proposal-1"),
            expiresAt: expiresAt
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, this.digestOf(a));
        sig = abi.encodePacked(r, s, v);
    }

    function digestOf(TichoriPresenceGuard.Attestation calldata a) external view returns (bytes32) {
        return guard.attestationDigest(a);
    }

    function _idx(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory list) {
        list = new uint256[](3);
        (list[0], list[1], list[2]) = (a, b, c);
    }

    function test_createdVaultHasGuardAndVerifier() public view {
        assertEq(address(uint160(uint256(vm.load(address(safe), GUARD_SLOT)))), address(guard));
        assertEq(guard.verifier(address(safe)), vm.addr(verifierKey));
        assertEq(safe.getThreshold(), 3);
    }

    function test_attestedQuorumPaysVendorAndRefundsGasInUsdt() public {
        TichoriPresenceGuard.SafeTx memory t = _payout(500e6);
        bytes32 h = _hash(t);
        (TichoriPresenceGuard.Attestation memory a, bytes memory vsig) =
            _attest(h, _idx(0, 1, 2), uint64(block.timestamp + 120), verifierKey);
        vm.recordLogs();
        bool ok = guard.executeWithAttestation(safe, t, _sign(h, _idx(0, 1, 2)), a, vsig);
        assertTrue(ok);
        assertEq(usdt.balanceOf(vendor), 500e6);
        uint256 refund = usdt.balanceOf(relayer);
        assertGt(refund, 0);
        assertLe(refund, t.safeTxGas + t.baseGas); // capped by what the owners signed
        assertEq(usdt.balanceOf(address(safe)), 10_000e6 - 500e6 - refund);
        assertEq(safe.nonce(), 1);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool seen;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(guard) && logs[i].topics[0] == TichoriPresenceGuard.CoPresentExecution.selector) {
                seen = true;
            }
        }
        assertTrue(seen);
    }

    function test_directSafeExecutionIsBlocked() public {
        TichoriPresenceGuard.SafeTx memory t = _payout(500e6);
        bytes memory sigs = _sign(_hash(t), _idx(0, 1, 2));
        vm.expectRevert(TichoriPresenceGuard.PresenceRequired.selector);
        safe.execTransaction(t.to, t.value, t.data, t.operation, t.safeTxGas, t.baseGas, t.gasPrice, t.gasToken, t.refundReceiver, sigs);
        assertEq(usdt.balanceOf(vendor), 0);
    }

    function test_attestationFromWrongVerifierIsRejected() public {
        TichoriPresenceGuard.SafeTx memory t = _payout(500e6);
        bytes32 h = _hash(t);
        (TichoriPresenceGuard.Attestation memory a, bytes memory vsig) =
            _attest(h, _idx(0, 1, 2), uint64(block.timestamp + 120), 0xBAD);
        bytes memory sigs = _sign(h, _idx(0, 1, 2));
        vm.expectRevert(TichoriPresenceGuard.BadAttestation.selector);
        guard.executeWithAttestation(safe, t, sigs, a, vsig);
    }

    function test_expiredAttestationIsRejected() public {
        TichoriPresenceGuard.SafeTx memory t = _payout(500e6);
        bytes32 h = _hash(t);
        (TichoriPresenceGuard.Attestation memory a, bytes memory vsig) =
            _attest(h, _idx(0, 1, 2), uint64(block.timestamp + 120), verifierKey);
        bytes memory sigs = _sign(h, _idx(0, 1, 2));
        vm.warp(block.timestamp + 121);
        vm.expectRevert(TichoriPresenceGuard.AttestationExpired.selector);
        guard.executeWithAttestation(safe, t, sigs, a, vsig);
    }

    function test_attestationForDifferentTransactionIsRejected() public {
        TichoriPresenceGuard.SafeTx memory approved = _payout(500e6);
        TichoriPresenceGuard.SafeTx memory changed = _payout(5_000e6);
        bytes32 h = _hash(approved);
        (TichoriPresenceGuard.Attestation memory a, bytes memory vsig) =
            _attest(h, _idx(0, 1, 2), uint64(block.timestamp + 120), verifierKey);
        bytes memory sigs = _sign(_hash(changed), _idx(0, 1, 2));
        vm.expectRevert(TichoriPresenceGuard.HashMismatch.selector);
        guard.executeWithAttestation(safe, changed, sigs, a, vsig);
    }

    function test_signerOutsideTheSessionIsRejected() public {
        TichoriPresenceGuard.SafeTx memory t = _payout(500e6);
        bytes32 h = _hash(t);
        // Owners 0,1,3 were together; owner 2 signed from elsewhere.
        (TichoriPresenceGuard.Attestation memory a, bytes memory vsig) =
            _attest(h, _idx(0, 1, 3), uint64(block.timestamp + 120), verifierKey);
        bytes memory sigs = _sign(h, _idx(0, 1, 2));
        vm.expectRevert(abi.encodeWithSelector(TichoriPresenceGuard.SignerNotAttested.selector, owners[2]));
        guard.executeWithAttestation(safe, t, sigs, a, vsig);
    }

    function test_tooFewPresentApproversIsRejected() public {
        TichoriPresenceGuard.SafeTx memory t = _payout(500e6);
        bytes32 h = _hash(t);
        uint256[] memory two = new uint256[](2);
        (two[0], two[1]) = (0, 1);
        (TichoriPresenceGuard.Attestation memory a, bytes memory vsig) =
            _attest(h, two, uint64(block.timestamp + 120), verifierKey);
        bytes memory sigs = _sign(h, _idx(0, 1, 2));
        vm.expectRevert(TichoriPresenceGuard.TooFewApprovers.selector);
        guard.executeWithAttestation(safe, t, sigs, a, vsig);
    }

    function test_attestationCannotBeReplayed() public {
        TichoriPresenceGuard.SafeTx memory t = _payout(100e6);
        bytes32 h = _hash(t);
        (TichoriPresenceGuard.Attestation memory a, bytes memory vsig) =
            _attest(h, _idx(0, 1, 2), uint64(block.timestamp + 120), verifierKey);
        bytes memory sigs = _sign(h, _idx(0, 1, 2));
        guard.executeWithAttestation(safe, t, sigs, a, vsig);
        vm.expectRevert(TichoriPresenceGuard.HashMismatch.selector);
        guard.executeWithAttestation(safe, t, sigs, a, vsig);
        assertEq(usdt.balanceOf(vendor), 100e6);
    }

    function _removeGuardTx() internal view returns (TichoriPresenceGuard.SafeTx memory t) {
        t = TichoriPresenceGuard.SafeTx({
            to: address(safe),
            value: 0,
            data: abi.encodeWithSignature("setGuard(address)", address(0)),
            operation: Operation.Call,
            safeTxGas: 0,
            baseGas: 0,
            gasPrice: 0,
            gasToken: address(0),
            refundReceiver: payable(address(0))
        });
    }

    function test_unanimousOwnersCanRemoveGuardWithoutVerifier() public {
        TichoriPresenceGuard.SafeTx memory t = _removeGuardTx();
        uint256[] memory all = new uint256[](5);
        for (uint256 i; i < 5; ++i) {
            all[i] = i;
        }
        bytes memory sigs = _sign(_hash(t), all);
        safe.execTransaction(t.to, t.value, t.data, t.operation, t.safeTxGas, t.baseGas, t.gasPrice, t.gasToken, t.refundReceiver, sigs);
        assertEq(uint256(vm.load(address(safe), GUARD_SLOT)), 0);
    }

    function test_quorumAloneCannotRemoveGuard() public {
        TichoriPresenceGuard.SafeTx memory t = _removeGuardTx();
        bytes memory sigs = _sign(_hash(t), _idx(0, 1, 2));
        vm.expectRevert(TichoriPresenceGuard.PresenceRequired.selector);
        safe.execTransaction(t.to, t.value, t.data, t.operation, t.safeTxGas, t.baseGas, t.gasPrice, t.gasToken, t.refundReceiver, sigs);
    }

    function test_setupOnlyRunsByDelegateCall() public {
        vm.expectRevert(TichoriSafeSetup.OnlyDelegateCall.selector);
        setup.setupGuard(address(guard), address(1));
    }
}
