import type { withArkiv } from '@tijori/server/storage/arkiv';
import { decodeEventLog, parseAbi, type Hex } from 'viem';

type ArkivStore = Parameters<Parameters<typeof withArkiv>[0]>[0];
const registry = '0x4400000000000000000000000000000000000044';
// Native entity event signatures from @arkiv-network/sdk 1.0.1.
const events = parseAbi([
 'event EntityCreated(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt, uint8 creationFlags)',
 'event EntityPatched(bytes32 indexed entityKey, address indexed owner)',
]);

/** Verify receipt metadata through the published SDK's read-only client. */
export async function verifyStorageReceipt(store: Pick<ArkivStore, 'reader' | 'address' | 'journal'>, entityKey: Hex) {
 const transactionHash = store.journal().lastTxHash;
 if (!transactionHash) return { transactionReceiptVerified: false };
 const receipt = await store.reader.getTransactionReceipt({ hash: transactionHash });
 const transaction = await store.reader.getTransaction({ hash: transactionHash });
 const eventMatches = receipt.logs.some(log => {
  if (log.address.toLowerCase() !== registry) return false;
  try {
   const event = decodeEventLog({ abi: events, data: log.data, topics: log.topics });
   return event.args.entityKey.toLowerCase() === entityKey.toLowerCase() && event.args.owner.toLowerCase() === store.address.toLowerCase();
  } catch { return false; }
 });
 if (receipt.status !== 'success' || !eventMatches || transaction.from.toLowerCase() !== store.address.toLowerCase() || transaction.to?.toLowerCase() !== registry || transaction.chainId !== 7794095) {
  throw new Error('Arkiv receipt does not verify this entity.');
 }
 return { transactionReceiptVerified: true, transactionHash };
}
