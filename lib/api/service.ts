import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { formatEther, isAddress } from 'viem';
import { withArkiv, StorageError } from '../db.ts';
import { publicState, VaultError } from '../vault.ts';
import { normalizeOwners, prepareSafe, SAFE_CHAIN_ID, verifySafeDeployment, readSafeStatus } from '../safe.ts';
import { providers } from '../integrations/providers.ts';
import { readWhitechainSafe } from '../whitechain/safe.ts';
import { formatUsdt } from '../whitechain/chain.ts';
import { IntegrationUnavailableError } from '../integrations/contracts.ts';
import { actionIdentity, applicationState, applyIntegratedAction, discoverRequests, evidenceFrom, verifyObject } from './domain.ts';

export function capabilities() {
 return {
  version: 'v1', authentication: 'unauthenticated-local-demo', publicHostingSupported: false,
  objectMatching: { provider: providers.objectMatching.id, mode: providers.objectMatching.mode },
  physicalApproval: { provider: providers.physicalApproval.id, mode: providers.physicalApproval.mode },
  externalVault: { provider: providers.externalVault.id, configured: providers.externalVault.configured },
  onchainExecution: 'user-wallet-and-safe-app',
 };
}
export async function readState(identityId?: string, versioned = false) {
 return withArkiv(async store => {
  const { vault } = await store.read();
  return versioned ? applicationState(vault, identityId) : publicState(vault);
 });
}
export async function balance(id: string | null) {
 const safe = await withArkiv(async store => (await store.read()).vault.groups.find(g => g.id === id)?.safe);
 if (!safe) throw new VaultError('This vault has no deployed Safe.');
 if (safe.chainId === 1874) {
  try {
   const status = await readWhitechainSafe(safe.address);
   return { address: status.address, chainId: status.chainId, owners: status.owners, threshold: status.threshold, nonce: status.nonce.toString(), guard: status.guard, balanceWei: status.balanceWei.toString(), balanceEth: formatEther(status.balanceWei), balanceUsdt: formatUsdt(status.balanceUsdt) };
  } catch { throw new StorageError('Could not read the Safe on Whitechain Sepolia.'); }
 }
 try { const status = await readSafeStatus(safe.address); return { ...status, balanceEth: formatEther(BigInt(status.balanceWei)) }; }
 catch { throw new StorageError('Could not read the Safe on Base Sepolia.'); }
}
export async function prepareDeployment(body: Record<string, unknown>) {
 const name = typeof body.name === 'string' ? body.name.trim() : '';
 if (!name || name.length > 120) throw new VaultError('Enter a vault name of at most 120 characters.');
 await withArkiv(async store => {
  if (!(await store.read()).vault.wallets.some(w => w.id === body.creatorId && w.object_name)) throw new VaultError('Choose a registered demo identity.');
 });
 const owners = normalizeOwners(body.owners);
 const saltNonce = BigInt('0x' + randomUUID().replaceAll('-', '')).toString();
 const kit = await prepareSafe(owners, saltNonce);
 const address = await kit.getAddress();
 const tx = await kit.createSafeDeploymentTransaction();
 return { name, creatorId: body.creatorId, owners, saltNonce, address, chainId: SAFE_CHAIN_ID, threshold: Math.floor(owners.length / 2) + 1, transaction: { to: tx.to, data: tx.data, value: `0x${BigInt(tx.value).toString(16)}` } };
}
export async function queryWorkflow(action: 'discover' | 'verify-object', body: Record<string, unknown>) {
 return withArkiv(async store => {
  const { vault } = await store.read();
  return action === 'discover' ? discoverRequests(vault, body, providers) : verifyObject(vault, body, providers);
 });
}
export async function verifyExternalApproval(body: Record<string, unknown>) {
 if (!providers.externalVault.configured) throw new IntegrationUnavailableError('External vault approval verification is not configured.');
 const { applicationId, identityAddress, vaultAddress, chainId, transactionHash } = body;
 if (typeof applicationId !== 'string' || !applicationId.trim() || applicationId.length > 100 || typeof identityAddress !== 'string' || !isAddress(identityAddress) || typeof vaultAddress !== 'string' || !isAddress(vaultAddress) || typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId <= 0 || typeof transactionHash !== 'string' || !/^0x[\da-f]{64}$/i.test(transactionHash)) throw new VaultError('An application, identity, vault, chain and exact transaction hash are required.');
 const evidence = evidenceFrom(body.evidence);
 if (!evidence) throw new VaultError('An evidence reference is required.');
 const verification = await providers.externalVault.verifyApproval({ applicationId, identityAddress, vaultAddress, chainId, transactionHash, evidence });
 if (!verification.accepted) throw new VaultError('External vault approval was not verified.');
 return { verification, transactionHash, vaultAddress, chainId, executed: false };
}
export async function mutate(action: string, body: Record<string, unknown>, operationId?: string | null, versioned = false) {
 const id = operationId || randomUUID();
 if (!/^[\w-]{1,100}$/.test(id)) throw new VaultError('Invalid operation ID.');
 const digest = createHash('sha256').update(JSON.stringify([action, body])).digest('hex');
 return withArkiv(async store => {
  const previous = await store.read(), vault = previous.vault;
  const saved = vault.operations.find(o => o.id === id);
  if (saved && saved.digest !== digest) throw new VaultError('This operation ID was already used with different input.');
  let actionBody = body;
  if (!saved && action === 'register-safe') {
   try { actionBody = { ...body, safe: await verifySafeDeployment(body as Parameters<typeof verifySafeDeployment>[0]) }; }
   catch { throw new VaultError('Could not verify the Safe deployment on Base Sepolia. Check the deployment and try again.'); }
  }
  const identityId = saved ? saved.identityId : await applyIntegratedAction(vault, action, actionBody, providers);
  if (!saved && action !== 'login') {
   vault.operations.push({ id, digest, ...(identityId ? { identityId } : {}) });
   vault.operations = vault.operations.slice(-100);
   await store.write(vault, previous);
  }
  const state = versioned ? applicationState(vault, actionIdentity(action, body, identityId)) : publicState(vault);
  return { ...state, ...(identityId ? { identityId } : {}), ...(action === 'login' && identityId ? { keyEnvelope: vault.wallets.find(w => w.id === identityId)?.keyEnvelope } : {}) };
 });
}
