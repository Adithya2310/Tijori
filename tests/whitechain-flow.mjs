// End-to-end: production Next server + local anvil chain (id 1874) carrying the canonical Safe 1.4.1
// bytecode and a mock USDT at the canonical address, plus the Arkiv RPC fixture. No testnet funds.
// Requires Foundry (anvil) and `npm run build` + `forge build` (see package.json "test:whitechain").
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPublicClient, createWalletClient, getAddress, http, parseEther } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { whitechainSepolia } from 'viem/chains';
import { rpcFixture } from './rpc-fixture.mjs';
import { erc20Abi, inboxKeyMessage, packSignatures, safeAbi, safeTxTypedData } from '@tijori/core/whitechain/safe-tx';
import { verifyWebhook } from '@tijori/invoices';

if (spawnSync('anvil', ['--version']).error) { console.log('Skipped Whitechain flow: Foundry anvil is not installed.'); process.exit(0); }
const USDT = '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7';
const artifact = async name => JSON.parse(await readFile(`contracts/out/${name}.sol/${name}.json`, 'utf8'));
const safeFixture = JSON.parse(await readFile('contracts/test/fixtures/safe-1.4.1.json', 'utf8'));
const anvilPort = 8645, appPort = 3179;
const anvil = spawn('anvil', ['--chain-id', '1874', '--port', String(anvilPort), '--silent'], { stdio: 'ignore' });
const dir = await mkdtemp(join(tmpdir(), 'tijori-whitechain-test-'));
const rpc = await rpcFixture();
const chainUrl = `http://127.0.0.1:${anvilPort}`;
const transport = http(chainUrl);
const chain = whitechainSepolia;
const reader = createPublicClient({ chain, transport });
const deployer = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'); // anvil default #0
const admin = createWalletClient({ chain, transport, account: deployer });
const relayerKey = generatePrivateKey(), verifierKey = generatePrivateKey();
const relayer = privateKeyToAccount(relayerKey).address;
const hooks = [];
const webhook = createServer(async (req, res) => { let body = ''; for await (const c of req) body += c; hooks.push({ body, signature: req.headers['tijori-signature'], legacySignature: req.headers['tichori-signature'] }); res.end('ok'); });
await new Promise(r => webhook.listen(0, '127.0.0.1', r));
let server;
try {
 for (let i = 0; i < 100; i++) { try { await reader.getChainId(); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
 for (const c of [safeFixture.factory, safeFixture.singletonL2, safeFixture.fallbackHandler]) await reader.request({ method: 'anvil_setCode', params: [c.address, c.code] });
 await reader.request({ method: 'anvil_setCode', params: [USDT, (await artifact('MockUSDT')).deployedBytecode.object] });
 const deploy = async name => { const hash = await admin.deployContract({ abi: (await artifact(name)).abi, bytecode: (await artifact(name)).bytecode.object }); return (await reader.waitForTransactionReceipt({ hash })).contractAddress; };
 const guard = await deploy('TichoriPresenceGuard'), setup = await deploy('TichoriSafeSetup');
 await reader.request({ method: 'anvil_setBalance', params: [relayer, '0x' + parseEther('5').toString(16)] });

 const privateKey = '0x' + '11'.repeat(32);
 const env = { ...process.env, VAULT_DATA_DIR: dir, ARKIV_ACCESS_KEY: 'fixture', ARKIV_WALLET_PRIVATE_KEY: privateKey, ARKIV_WALLET_ADDRESS: privateKeyToAccount(privateKey).address, ARKIV_STATE_ENCRYPTION_KEY: '22'.repeat(32), ARKIV_NAMESPACE: 'fixture', ARKIV_MAX_TOTAL_FEE_TGLM: '0.1', NODE_OPTIONS: `--import=${pathToFileURL(resolve('tests/rpc-preload.mjs')).href}`, TIJORI_FIXTURE_URL: rpc.url,
  WHITECHAIN_RPC_URL: chainUrl, WHITECHAIN_RELAYER_PRIVATE_KEY: relayerKey, TIJORI_VERIFIER_PRIVATE_KEY: verifierKey, TIJORI_GUARD_ADDRESS: guard, TIJORI_SAFE_SETUP_ADDRESS: setup, TIJORI_API_MASTER_KEY: '33'.repeat(32), TIJORI_WEBHOOK_ALLOW_PRIVATE: '1' };
 server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(appPort)], { env, stdio: 'ignore' });
 const base = `http://localhost:${appPort}/api/v1/`;
 const call = async (path, body, headers = {}) => { const r = await fetch(base + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) } : { headers }); const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; } return { status: r.status, data }; };
 for (let i = 0; i < 150; i++) { try { if ((await call('capabilities')).status === 200) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
 assert.equal((await call('capabilities')).data.whitechain.configured, true);

 // Three enrolled identities; the test holds their keys to sign like their browsers would.
 const keyEnvelope = { version: 1, salt: 'aa'.repeat(16), iv: 'bb'.repeat(12), ciphertext: 'cc'.repeat(48) };
 const people = [];
 for (let i = 0; i < 3; i++) {
  const account = privateKeyToAccount(generatePrivateKey());
  const r = await call('identities', { name: `Signer ${i}`, address: account.address.toLowerCase(), keyEnvelope, objectName: `Object ${i}` });
  assert.equal(r.status, 200); people.push({ id: r.data.identityId, account, object: `Object ${i}` });
 }
 const relayerNonce = () => reader.getTransactionCount({ address: relayer });

 // Gasless guarded vault, idempotent per operation ID.
 const create = { name: 'Builders DAO', creatorId: people[0].id, addresses: [people[1].account.address, people[2].account.address] };
 let r = await call('vaults/whitechain', create, { 'Idempotency-Key': 'create-dao' });
 assert.equal(r.status, 200, JSON.stringify(r.data)); const vaultId = r.data.vaultId;
 const vault = r.data.groups.find(g => g.id === vaultId);
 assert.equal(vault.safe.chainId, 1874); assert.equal(getAddress(vault.safe.guard), getAddress(guard)); assert.equal(vault.requiredApprovals, 2);
 const safe = vault.safe.address;
 const nonceAfterDeploy = await relayerNonce();
 assert.equal((await call('vaults/whitechain', create, { 'Idempotency-Key': 'create-dao' })).status, 200);
 assert.equal(await relayerNonce(), nonceAfterDeploy, 'retry must not deploy again');
 await admin.writeContract({ address: USDT, abi: (await artifact('MockUSDT')).abi, functionName: 'mint', args: [safe, 1_000_000_000n] });
 assert.equal((await call(`balance?vaultId=${vaultId}`)).data.balanceUsdt, '1000');

 // Vendor invoice inbox (Operate): derived key, idempotent externalId, signed webhook on payment.
 const issuedAt = new Date().toISOString();
 const inboxRequest = { vaultId, identityId: people[0].id, issuedAt, signature: await people[0].account.signMessage({ message: inboxKeyMessage(vaultId, people[0].id, issuedAt) }) };
 assert.equal((await call('vaults/inbox-key', { ...inboxRequest, signature: await people[1].account.signMessage({ message: inboxKeyMessage(vaultId, people[0].id, issuedAt) }) })).status, 400, 'inbox key needs the member own key');
 assert.equal((await call('vaults/inbox-key', { vaultId, identityId: people[0].id })).status, 400, 'unsigned inbox key request is refused');
 const inbox = (await call('vaults/inbox-key', inboxRequest)).data;
 assert.match(inbox.inboxKey, /^tinbox_/);
 assert.equal((await call('invoices', { vendorName: 'X', vendorAddress: privateKeyToAccount(generatePrivateKey()).address, amount: '1', dueDate: '2026-12-01', webhookUrl: 'http://127.0.0.1.nip.io/hook', externalId: 'SSRF-1' }, { Authorization: `Bearer ${inbox.inboxKey}` })).status, 200, 'private DNS names pass creation only when private webhooks are allowed');
 const vendor = privateKeyToAccount(generatePrivateKey()).address;
 const auth = { Authorization: `Bearer ${inbox.inboxKey}` };
 const invoiceBody = { vendorName: 'Priya Studio', vendorAddress: vendor, amount: '250', memo: 'Website redesign', dueDate: '2026-11-20', externalId: 'INV-1', webhookUrl: `http://127.0.0.1:${webhook.address().port}/hook` };
 r = await call('invoices', invoiceBody, auth); assert.equal(r.status, 200); assert.equal(r.data.created, true);
 const invoiceId = r.data.invoice.id;
 assert.equal((await call('invoices', invoiceBody, auth)).data.created, false);
 assert.equal((await call('invoices', invoiceBody, { Authorization: 'Bearer tinbox_bad' })).status, 401);

 // Proposal and a co-present approval session.
 r = await call('proposals', { vaultId, proposerId: people[1].id, invoiceId }, { 'Idempotency-Key': 'pay-inv-1' });
 assert.equal(r.status, 200, JSON.stringify(r.data)); const proposalId = r.data.proposalId;
 r = await call('approval-sessions', { proposalId, initiatorId: people[0].id });
 assert.equal(r.status, 200, JSON.stringify(r.data)); const { session, emit } = r.data;
 const listed = (await call(`treasury/sessions?identityId=${people[1].id}`)).data.sessions.find(s => s.id === session.id);
 assert.equal(listed.presence.simulatedCode, emit.code); assert.equal(listed.proposal.amount, '250');
 const typed = s => safeTxTypedData(1874, s.safe, { ...s.safeTx, value: BigInt(s.safeTx.value), safeTxGas: BigInt(s.safeTx.safeTxGas), baseGas: BigInt(s.safeTx.baseGas), gasPrice: BigInt(s.safeTx.gasPrice), nonce: BigInt(s.safeTx.nonce) });
 const approve = async (person, s, overrides = {}) => call('physical-approvals', { sessionId: s.id, walletId: person.id, objectName: person.object, evidence: { reference: emit.code, challengeId: s.presence.challengeId }, signature: await person.account.signTypedData(typed(s)), ...overrides });

 const arkivBefore = rpc.control.sends, chainBefore = await relayerNonce();
 assert.equal((await approve(people[1], session, { objectName: 'wrong object' })).status, 400, 'object must match');
 assert.equal((await approve(people[1], session, { evidence: { reference: '00000000', challengeId: session.presence.challengeId } })).status, 400, 'presence code must match');
 assert.equal((await approve(people[1], session, { signature: await people[2].account.signTypedData(typed(session)) })).status, 400, 'signature must be the approver key');
 assert.equal(rpc.control.sends, arkivBefore); assert.equal(await relayerNonce(), chainBefore, 'rejections cost nothing');
 r = await approve(people[0], session); assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.session.status, 'open');
 assert.equal((await approve(people[0], session)).status, 400, 'no double approval');

 // Valid owner signatures without a presence attestation cannot move funds (e.g. via the Safe app).
 const t = typed(session).message;
 const bypass = packSignatures(await Promise.all([people[0], people[1]].map(async p => ({ signer: p.account.address, signature: await p.account.signTypedData(typed(session)) }))));
 await assert.rejects(admin.writeContract({ address: safe, abi: safeAbi, functionName: 'execTransaction', args: [t.to, t.value, t.data, t.operation, t.safeTxGas, t.baseGas, t.gasPrice, t.gasToken, t.refundReceiver, bypass] }));

 // Second co-present approval reaches the majority: attested, relayed, paid.
 r = await approve(people[1], session); assert.equal(r.status, 200, JSON.stringify(r.data));
 assert.equal(r.data.session.status, 'executed', JSON.stringify(r.data.session));
 assert.equal(await reader.readContract({ address: USDT, abi: erc20Abi, functionName: 'balanceOf', args: [vendor] }), 250_000_000n);
 const refund = await reader.readContract({ address: USDT, abi: erc20Abi, functionName: 'balanceOf', args: [relayer] });
 assert.ok(refund > 0n && refund < 1_000_000n, 'vault refunded gas in USDT, under $1');
 const paid = r.data.invoices.find(i => i.id === invoiceId); assert.equal(paid.status, 'paid'); assert.equal(paid.paid_tx_hash, r.data.session.txHash);
 assert.equal(r.data.proposals.find(p => p.id === proposalId).status, 'executed');
 const vendorView = await call(`invoices?id=${invoiceId}`, undefined, auth);
 assert.equal(vendorView.data.invoice.status, 'paid'); assert.match(vendorView.data.invoice.payment.explorerUrl, /explorer\.testnet\.whitechain\.io\/tx\//);
 for (let i = 0; i < 50 && !hooks.length; i++) await new Promise(r => setTimeout(r, 100));
 assert.equal(hooks.length, 1, 'webhook delivered');
 assert.ok(verifyWebhook(hooks[0].body, hooks[0].signature, inbox.webhookSecret));
 assert.equal(hooks[0].legacySignature, hooks[0].signature, 'existing receivers keep getting Tichori-Signature');
 assert.equal(JSON.parse(hooks[0].body).type, 'invoice.paid');
 assert.ok(!verifyWebhook(hooks[0].body, hooks[0].signature, 'whsec_wrong'));
 const csv = await call(`treasury/export?vaultId=${vaultId}&identityId=${people[2].id}`);
 assert.equal(csv.status, 200); assert.ok(csv.data.includes(r.data.session.txHash)); assert.ok(csv.data.includes('Priya Studio'));

 // Approvals from different sessions never add up.
 r = await call('proposals', { vaultId, proposerId: people[0].id, to: vendor, amount: '10', note: 'Tip' }, { 'Idempotency-Key': 'pay-2' });
 const second = r.data.proposalId;
 const s1 = (await call('approval-sessions', { proposalId: second, initiatorId: people[0].id })).data;
 const emit1 = s1.emit; assert.equal((await call('physical-approvals', { sessionId: s1.session.id, walletId: people[0].id, objectName: people[0].object, evidence: { reference: emit1.code, challengeId: s1.session.presence.challengeId }, signature: await people[0].account.signTypedData(typed(s1.session)) })).status, 200);
 const s2 = (await call('approval-sessions', { proposalId: second, initiatorId: people[1].id })).data;
 assert.equal((await call('physical-approvals', { sessionId: s2.session.id, walletId: people[1].id, objectName: people[1].object, evidence: { reference: s2.emit.code, challengeId: s2.session.presence.challengeId }, signature: await people[1].account.signTypedData(typed(s2.session)) })).data.session.status, 'open', 'one approval per session is not a quorum');
 assert.equal((await call('physical-approvals', { sessionId: s1.session.id, walletId: people[1].id, objectName: people[1].object, evidence: { reference: emit1.code, challengeId: s1.session.presence.challengeId }, signature: await people[1].account.signTypedData(typed(s1.session)) })).status, 400, 'superseded session is closed');
 assert.equal(await reader.readContract({ address: USDT, abi: erc20Abi, functionName: 'balanceOf', args: [vendor] }), 250_000_000n);

 const gas = (await call('relayer')).data;
 assert.equal(gas.configured, true); assert.equal(gas.sponsoredTransactions, 2); assert.ok(Number(gas.refundsReceivedUsdt) > 0);
 assert.ok(!JSON.stringify(gas).includes(relayerKey.slice(2)) && !JSON.stringify(await call(`treasury/sessions?identityId=${people[0].id}`)).includes(verifierKey.slice(2)));
 console.log('Passed Whitechain flow: gasless guarded vault, vendor invoice, object + presence + key checks per approval, guard blocks un-attested execution, co-present majority pays in USDT with USDT gas refund, signed webhook, CSV export, sessions never combine.');
} finally {
 if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(r => server.once('exit', r)); }
 anvil.kill('SIGTERM');
 webhook.close();
 await rpc.close();
 await rm(dir, { recursive: true, force: true });
}
