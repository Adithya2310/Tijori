// Pure Safe/guard encoding helpers shared by the browser, the server and tests. No secrets here.
import { concat, encodeAbiParameters, encodeFunctionData, getAddress, getContractAddress, keccak256, parseAbi, stringToBytes, zeroAddress, type Address, type Hex } from 'viem';

export const safeAbi = parseAbi([
 'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)',
 'function nonce() view returns (uint256)',
 'function getThreshold() view returns (uint256)',
 'function getOwners() view returns (address[])',
 'function isOwner(address owner) view returns (bool)',
 'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)',
 'event ExecutionSuccess(bytes32 txHash, uint256 payment)',
 'event ExecutionFailure(bytes32 txHash, uint256 payment)',
]);
export const factoryAbi = parseAbi([
 'function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)',
 'function proxyCreationCode() pure returns (bytes)',
 'event ProxyCreation(address indexed proxy, address singleton)',
]);
export const safeSetupAbi = parseAbi(['function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)']);
export const setupHookAbi = parseAbi(['function setupGuard(address guard, address verifier)']);
export const guardAbi = parseAbi([
 'struct SafeTx { address to; uint256 value; bytes data; uint8 operation; uint256 safeTxGas; uint256 baseGas; uint256 gasPrice; address gasToken; address refundReceiver; }',
 'struct Attestation { address safe; bytes32 safeTxHash; bytes32 sessionId; address[] approvers; bytes32 ref; uint64 expiresAt; }',
 'function executeWithAttestation(address safe, SafeTx t, bytes signatures, Attestation a, bytes verifierSignature) returns (bool success)',
 'function verifier(address safe) view returns (address)',
 'function attestationDigest(Attestation a) view returns (bytes32)',
 'event CoPresentExecution(address indexed safe, bytes32 indexed safeTxHash, bytes32 indexed sessionId, bytes32 ref, address[] approvers, bool success)',
]);
export const erc20Abi = parseAbi([
 'function transfer(address to, uint256 value) returns (bool)',
 'function balanceOf(address owner) view returns (uint256)',
 'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

export type SafeTx = { to: Address; value: bigint; data: Hex; operation: 0 | 1; safeTxGas: bigint; baseGas: bigint; gasPrice: bigint; gasToken: Address; refundReceiver: Address; nonce: bigint };
export type Attestation = { safe: Address; safeTxHash: Hex; sessionId: Hex; approvers: Address[]; ref: Hex; expiresAt: bigint };

export const safeTxTypes = {
 SafeTx: [
  { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'data', type: 'bytes' }, { name: 'operation', type: 'uint8' },
  { name: 'safeTxGas', type: 'uint256' }, { name: 'baseGas', type: 'uint256' }, { name: 'gasPrice', type: 'uint256' },
  { name: 'gasToken', type: 'address' }, { name: 'refundReceiver', type: 'address' }, { name: 'nonce', type: 'uint256' },
 ],
} as const;
/** EIP-712 SafeTx typed data (Safe 1.4.1 domain: chainId + verifyingContract). */
export function safeTxTypedData(chainId: number, safe: Address, tx: SafeTx) {
 return { domain: { chainId, verifyingContract: getAddress(safe) }, types: safeTxTypes, primaryType: 'SafeTx' as const, message: tx };
}
export const attestationTypes = {
 CoPresence: [
  { name: 'safe', type: 'address' }, { name: 'safeTxHash', type: 'bytes32' }, { name: 'sessionId', type: 'bytes32' },
  { name: 'approvers', type: 'address[]' }, { name: 'ref', type: 'bytes32' }, { name: 'expiresAt', type: 'uint64' },
 ],
} as const;
export function attestationTypedData(chainId: number, guard: Address, attestation: Attestation) {
 return { domain: { name: 'TichoriPresenceGuard', version: '1', chainId, verifyingContract: getAddress(guard) }, types: attestationTypes, primaryType: 'CoPresence' as const, message: attestation };
}

export const majority = (owners: number) => Math.floor(owners / 2) + 1;
/** Safe setup that installs the presence guard and verifier atomically at creation. */
export function guardedInitializer(input: { owners: Address[]; setup: Address; guard: Address; verifier: Address; fallbackHandler: Address }) {
 const data = encodeFunctionData({ abi: setupHookAbi, functionName: 'setupGuard', args: [input.guard, input.verifier] });
 return encodeFunctionData({ abi: safeSetupAbi, functionName: 'setup', args: [input.owners, BigInt(majority(input.owners.length)), input.setup, data, input.fallbackHandler, zeroAddress, 0n, zeroAddress] });
}
/** CREATE2 address used by SafeProxyFactory 1.4.1 createProxyWithNonce. */
export function predictSafeAddress(input: { factory: Address; singleton: Address; proxyCreationCode: Hex; initializer: Hex; saltNonce: bigint }) {
 const salt = keccak256(concat([keccak256(input.initializer), encodeAbiParameters([{ type: 'uint256' }], [input.saltNonce])]));
 const bytecode = concat([input.proxyCreationCode, encodeAbiParameters([{ type: 'uint256' }], [BigInt(input.singleton)])]);
 return getContractAddress({ opcode: 'CREATE2', from: input.factory, salt, bytecode });
}
/** Safe expects owner signatures concatenated in strictly ascending signer order. */
export function packSignatures(entries: { signer: Address; signature: Hex }[]): Hex {
 const sorted = [...entries].sort((a, b) => (BigInt(a.signer) < BigInt(b.signer) ? -1 : 1));
 return concat(sorted.map(e => e.signature));
}
export const sortAddresses = (list: Address[]) => [...list].map(a => getAddress(a)).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
export const idToBytes32 = (id: string) => keccak256(stringToBytes(id));
export const usdtTransferData = (to: Address, amount: bigint) => encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [getAddress(to), amount] });
