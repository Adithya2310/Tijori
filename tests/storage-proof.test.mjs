import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, parseAbi } from 'viem';
import { verifyStorageReceipt } from '../lib/storage-proof.ts';

const registry = '0x4400000000000000000000000000000000000044';
const owner = `0x${'11'.repeat(20)}`, entityKey = `0x${'22'.repeat(32)}`, hash = `0x${'33'.repeat(32)}`;
const abi = parseAbi([
 'event EntityCreated(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt, uint8 creationFlags)',
 'event EntityPatched(bytes32 indexed entityKey, address indexed owner)',
]);
function fixture(eventName = 'EntityPatched') {
 const log = { address: registry, topics: encodeEventTopics({ abi, eventName, args: { entityKey, owner } }),
  data: eventName === 'EntityCreated' ? encodeAbiParameters([{ type: 'uint64' }, { type: 'uint8' }], [100n, 0]) : '0x' };
 const receipt = { status: 'success', logs: [log] };
 const transaction = { from: owner, to: registry, chainId: 7794095 };
 const store = { address: owner, journal: () => ({ lastTxHash: hash }), reader: {
  getTransactionReceipt: async ({ hash: requested }) => { assert.equal(requested, hash); return receipt; },
  getTransaction: async ({ hash: requested }) => { assert.equal(requested, hash); return transaction; },
 } };
 return { store, receipt, transaction, log };
}

test('published SDK methods verify both creation and patch receipts and expose only metadata', async () => {
 for (const event of ['EntityCreated', 'EntityPatched']) {
  assert.deepEqual(await verifyStorageReceipt(fixture(event).store, entityKey), { transactionReceiptVerified: true, transactionHash: hash });
 }
});

test('a read without a journal receipt does not claim transaction verification', async () => {
 const store = { journal: () => ({}) };
 assert.deepEqual(await verifyStorageReceipt(store, entityKey), { transactionReceiptVerified: false });
});

test('receipt verification rejects reverted, unrelated and wrong-network transactions', async () => {
 const invalidCases = [
  f => { f.receipt.status = 'reverted'; },
  f => { f.receipt.logs = []; },
  f => { f.log.address = owner; },
  f => { f.log.data = '0xff'; f.log.topics = []; },
  f => { f.transaction.from = registry; },
  f => { f.transaction.to = owner; },
  f => { f.transaction.to = null; },
  f => { f.transaction.chainId = 1; },
  f => { f.log.topics = encodeEventTopics({ abi, eventName: 'EntityPatched', args: { entityKey: hash, owner } }); },
  f => { f.log.topics = encodeEventTopics({ abi, eventName: 'EntityPatched', args: { entityKey, owner: registry } }); },
 ];
 for (const invalidate of invalidCases) {
  const f = fixture(); invalidate(f);
  await assert.rejects(verifyStorageReceipt(f.store, entityKey), /does not verify/);
 }
});

test('RPC failures propagate so the route can return 503', async () => {
 const { store } = fixture();
 store.reader.getTransactionReceipt = async () => { throw new Error('Receipt unavailable'); };
 await assert.rejects(verifyStorageReceipt(store, entityKey), /Receipt unavailable/);
});
