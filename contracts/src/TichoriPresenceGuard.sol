// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Safe 1.4.1 Enum.Operation (ABI-encoded as uint8).
enum Operation {
    Call,
    DelegateCall
}

interface ISafe {
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 _nonce
    ) external view returns (bytes32);

    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures
    ) external payable returns (bool success);

    function nonce() external view returns (uint256);
    function getThreshold() external view returns (uint256);
    function getOwners() external view returns (address[] memory);
    function isOwner(address owner) external view returns (bool);
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @dev Mirrors Safe 1.4.1 `Guard` so `type(ISafeGuard).interfaceId` matches GuardManager's check.
interface ISafeGuard is IERC165 {
    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures,
        address msgSender
    ) external;

    function checkAfterExecution(bytes32 txHash, bool success) external;
}

/// @title Tichori co-presence guard for Safe 1.4.1 vaults on Whitechain.
/// @notice Every execution of a guarded Safe must go through `executeWithAttestation` with a fresh
/// EIP-712 attestation, signed by the Safe's registered Tichori verifier, stating that a quorum of
/// owners verified their personal object and were physically together in one approval session for
/// exactly this Safe transaction. The threshold Safe signatures must come from those attested owners.
/// Any other execution path (for example the Safe web app) reverts, except a unanimous owner
/// escape hatch that may only remove this guard or rotate the verifier.
/// @dev The verifier is a trusted off-chain service in this prototype: it checks object and
/// ultrasonic presence evidence. The contract enforces that its attestation exists and matches;
/// it cannot itself prove where anyone was.
contract TichoriPresenceGuard is ISafeGuard {
    struct SafeTx {
        address to;
        uint256 value;
        bytes data;
        Operation operation;
        uint256 safeTxGas;
        uint256 baseGas;
        uint256 gasPrice;
        address gasToken;
        address payable refundReceiver;
    }

    struct Attestation {
        address safe;
        bytes32 safeTxHash;
        bytes32 sessionId;
        address[] approvers; // strictly ascending, all current owners
        bytes32 ref; // application reference, e.g. keccak256(proposalId)
        uint64 expiresAt;
    }

    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "CoPresence(address safe,bytes32 safeTxHash,bytes32 sessionId,address[] approvers,bytes32 ref,uint64 expiresAt)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("TichoriPresenceGuard");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1_HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    bytes4 private constant SET_GUARD = bytes4(keccak256("setGuard(address)"));

    /// @notice Tichori verifier key per Safe. Set by the Safe itself (during setup, or later via an
    /// attested or unanimous Safe transaction).
    mapping(address safe => address) public verifier;
    /// @dev Set only for the duration of `executeWithAttestation`.
    bytes32 private transient pendingExecution;

    event VerifierSet(address indexed safe, address indexed verifier);
    event CoPresentExecution(
        address indexed safe,
        bytes32 indexed safeTxHash,
        bytes32 indexed sessionId,
        bytes32 ref,
        address[] approvers,
        bool success
    );

    error NotSafe();
    error NoVerifier();
    error HashMismatch();
    error AttestationExpired();
    error BadAttestation();
    error TooFewApprovers();
    error ApproversNotSortedOwners();
    error SignerNotAttested(address signer);
    error UnsupportedSignature();
    error PresenceRequired();

    /// @notice Register or rotate the caller's verifier. A Safe calls this for itself.
    function setVerifier(address newVerifier) external {
        if (newVerifier == address(0)) revert NoVerifier();
        verifier[msg.sender] = newVerifier;
        emit VerifierSet(msg.sender, newVerifier);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function attestationDigest(Attestation calldata a) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH,
                a.safe,
                a.safeTxHash,
                a.sessionId,
                keccak256(abi.encodePacked(a.approvers)),
                a.ref,
                a.expiresAt
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// @notice Execute an attested Safe transaction. Anyone may relay; the Safe pays any gas refund
    /// that its owners signed (gasPrice, gasToken, refundReceiver are part of the Safe signature).
    function executeWithAttestation(
        ISafe safe,
        SafeTx calldata t,
        bytes calldata signatures,
        Attestation calldata a,
        bytes calldata verifierSignature
    ) external returns (bool success) {
        if (a.safe != address(safe)) revert NotSafe();
        bytes32 txHash = _safeTxHash(safe, t, safe.nonce());
        if (txHash != a.safeTxHash) revert HashMismatch();
        if (block.timestamp > a.expiresAt) revert AttestationExpired();
        address v = verifier[address(safe)];
        if (v == address(0)) revert NoVerifier();
        if (_recover(attestationDigest(a), verifierSignature) != v) revert BadAttestation();

        uint256 threshold = safe.getThreshold();
        if (a.approvers.length < threshold) revert TooFewApprovers();
        address last;
        for (uint256 i; i < a.approvers.length; ++i) {
            address approver = a.approvers[i];
            if (approver <= last || !safe.isOwner(approver)) revert ApproversNotSortedOwners();
            last = approver;
        }
        // The Safe validates the first `threshold` signatures; each of those signers must be attested.
        if (signatures.length < threshold * 65) revert UnsupportedSignature();
        for (uint256 i; i < threshold; ++i) {
            address signer = _recoverAt(txHash, signatures, i);
            if (!_contains(a.approvers, signer)) revert SignerNotAttested(signer);
        }

        pendingExecution = keccak256(abi.encode(address(safe), txHash));
        success = _exec(safe, t, signatures);
        pendingExecution = bytes32(0);
        emit CoPresentExecution(address(safe), txHash, a.sessionId, a.ref, a.approvers, success);
    }

    function _safeTxHash(ISafe safe, SafeTx calldata t, uint256 safeNonce) private view returns (bytes32) {
        return safe.getTransactionHash(
            t.to, t.value, t.data, t.operation, t.safeTxGas, t.baseGas, t.gasPrice, t.gasToken, t.refundReceiver, safeNonce
        );
    }

    function _exec(ISafe safe, SafeTx calldata t, bytes calldata signatures) private returns (bool) {
        return safe.execTransaction(
            t.to, t.value, t.data, t.operation, t.safeTxGas, t.baseGas, t.gasPrice, t.gasToken, t.refundReceiver, signatures
        );
    }

    /// @inheritdoc ISafeGuard
    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures,
        address msgSender
    ) external view override {
        ISafe safe = ISafe(msg.sender);
        // Safe 1.4.1 increments its nonce before calling the guard.
        bytes32 txHash = safe.getTransactionHash(
            to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, safe.nonce() - 1
        );
        if (msgSender == address(this) && pendingExecution == keccak256(abi.encode(msg.sender, txHash))) return;
        if (_isEscapeCall(msg.sender, to, value, data, operation) && _isUnanimous(safe, txHash, signatures)) return;
        revert PresenceRequired();
    }

    /// @inheritdoc ISafeGuard
    function checkAfterExecution(bytes32, bool) external view override {}

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(ISafeGuard).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    /// @dev Only `Safe.setGuard(...)` on the Safe itself or `setVerifier(...)` on this guard.
    function _isEscapeCall(address safe, address to, uint256 value, bytes memory data, Operation operation)
        private
        view
        returns (bool)
    {
        if (value != 0 || operation != Operation.Call || data.length != 36) return false;
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes4 selector = bytes4(data); // reads the 4-byte selector of a 36-byte call
        return (to == safe && selector == SET_GUARD) || (to == address(this) && selector == this.setVerifier.selector);
    }

    function _isUnanimous(ISafe safe, bytes32 txHash, bytes memory signatures) private view returns (bool) {
        address[] memory owners = safe.getOwners();
        if (signatures.length < owners.length * 65) return false;
        address last;
        for (uint256 i; i < owners.length; ++i) {
            address signer = _recoverAtMemory(txHash, signatures, i);
            if (signer <= last || !safe.isOwner(signer)) return false;
            last = signer;
        }
        return true;
    }

    function _contains(address[] calldata list, address value) private pure returns (bool) {
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == value) return true;
        }
        return false;
    }

    function _recoverAt(bytes32 digest, bytes calldata signatures, uint256 index) private pure returns (address) {
        uint256 offset = index * 65;
        bytes32 r = bytes32(signatures[offset:offset + 32]);
        bytes32 s = bytes32(signatures[offset + 32:offset + 64]);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint8 v = uint8(signatures[offset + 64]);
        return _ecrecover(digest, v, r, s);
    }

    function _recoverAtMemory(bytes32 digest, bytes memory signatures, uint256 index) private pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            let pos := add(add(signatures, 0x20), mul(index, 65))
            r := mload(pos)
            s := mload(add(pos, 0x20))
            v := byte(0, mload(add(pos, 0x40)))
        }
        return _ecrecover(digest, v, r, s);
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) revert BadAttestation();
        return _recoverAt(digest, signature, 0);
    }

    /// @dev Plain ECDSA only (v = 27/28, low-s). Contract, approved-hash and eth_sign signatures are rejected.
    function _ecrecover(bytes32 digest, uint8 v, bytes32 r, bytes32 s) private pure returns (address signer) {
        if ((v != 27 && v != 28) || uint256(s) > SECP256K1_HALF_N) revert UnsupportedSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert UnsupportedSignature();
    }
}
