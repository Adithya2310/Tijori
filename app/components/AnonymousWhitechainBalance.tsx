'use client';

import { useEffect, useRef, useState } from 'react';
import { useTijori } from '@tijori/react';
import { encodeFunctionData, formatEther, formatUnits, isAddress, type Address } from 'viem';
import { requestViaNym } from '../../sdk/packages/client/src/anon-rpc';
import { WHITECHAIN_TESTNET, verifyTestnetChain } from '../../sdk/packages/client/src/anon-rpc-protocol';

const balanceOfAbi = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }] as const;

export default function AnonymousWhitechainBalance({ address }: { address: Address }) {
 const { client } = useTijori();
 const [message, setMessage] = useState('');
 const [busy, setBusy] = useState(false);
 const active = useRef<AbortController | null>(null);
 useEffect(() => () => { active.current?.abort(); active.current = null; }, [address]);

 async function check() {
  if (active.current) return;
  const controller = new AbortController(); active.current = controller;
  setBusy(true); setMessage('Connecting to Nym; this may take some time…');
  try {
   const capabilities = await client.capabilities();
   const whitechain = capabilities.whitechain as { asset?: { address?: unknown; symbol?: unknown; decimals?: unknown } } | undefined;
   const asset = whitechain?.asset;
   if (!asset || typeof asset.address !== 'string' || !isAddress(asset.address) || (asset.symbol !== 'USDT' && asset.symbol !== 'rUSD') || asset.decimals !== 6) throw new Error('Treasury asset configuration is unavailable.');
   if (controller.signal.aborted) return;
   const endpoint = WHITECHAIN_TESTNET.endpoint;
   const options = { signal: controller.signal };
   const [chain, native, token] = await Promise.all([
    requestViaNym({ endpoint, method: 'eth_chainId', params: [] }, options),
    requestViaNym({ endpoint, method: 'eth_getBalance', params: [address, 'latest'] }, options),
    requestViaNym({ endpoint, method: 'eth_call', params: [{ to: asset.address, data: encodeFunctionData({ abi: balanceOfAbi, functionName: 'balanceOf', args: [address] }) }, 'latest'] }, options),
   ]);
   verifyTestnetChain(chain);
   if (active.current === controller) setMessage(`Anon RPC result: ${formatEther(BigInt(native))} WBT · ${formatUnits(BigInt(token), 6)} ${asset.symbol}`);
  } catch {
   controller.abort();
   if (active.current === controller) setMessage('Anon RPC balance check failed or timed out. No direct fallback was used.');
  } finally {
   if (active.current === controller) { active.current = null; setBusy(false); }
  }
 }

 return <section className="tj-acoustic-section">
  <h2>Check balance via Anon RPC</h2>
  <p className="tj-form-hint">Optional Whitechain balance check through the Nym worker. The regular treasury display and transaction checks still use the server’s RPC. Bootstrap is direct; the destination receives the vault address.</p>
  <button className="tj-light-btn" disabled={busy} onClick={() => void check()}>{busy ? 'Checking…' : 'Check WBT and token balance'}</button>
  {message && <p role="status" className="tj-form-hint">{message}</p>}
 </section>;
}
