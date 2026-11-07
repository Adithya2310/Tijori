'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { requestViaNym } from '@tijori/client';
import { WHITECHAIN_TESTNET, verifyTestnetChain, type DiagnosticMode } from '@tijori/client';
import styles from './page.module.css';
import { readPrivateVault } from '../../../lib/anon-vault';
import { VAULT_USDT } from '../../../lib/anon-vault-protocol';

export default function AnonRpcDiagnostic() {
 const [busy, setBusy] = useState(false);
 const [output, setOutput] = useState('Ready. No request sent.');
 const [failed, setFailed] = useState(false);
 const [elapsed, setElapsed] = useState<number | null>(null);
 const [vaultAddress, setVaultAddress] = useState('');
 const active = useRef<AbortController | null>(null);
 useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
 async function run(mode: DiagnosticMode) {
  if (active.current) return;
  const controller = new AbortController(); active.current = controller;
  setBusy(true); setFailed(false); setElapsed(null);
  setOutput(mode === 'normal' ? 'Loading the Nym worker and connecting… (90 second limit)' : 'Running a local failure test…');
  const start = performance.now();
  try {
   const result = verifyTestnetChain(await requestViaNym({ endpoint: WHITECHAIN_TESTNET.endpoint, method: 'eth_chainId', params: [] }, {
    signal: controller.signal, mode, timeoutMs: mode === 'timeout' ? 1000 : 90_000,
   }));
   if (active.current === controller) setOutput(JSON.stringify({ jsonrpc: '2.0', id: 1, result, chainId: Number(BigInt(result)) }, null, 2));
  } catch (error) {
   if (active.current === controller) { setFailed(true); const message = error instanceof Error ? error.message : 'Unknown transport error'; setOutput(message.includes('No direct fallback was used.') ? message : `${message}\nNo direct fallback was used.`); }
  } finally {
   if (active.current === controller) { active.current = null; setBusy(false); setElapsed(Math.round(performance.now() - start)); }
  }
 }
 async function runVault() {
  if (active.current) return;
  const controller = new AbortController(); active.current = controller;
  setBusy(true); setFailed(false); setElapsed(null); setOutput('Reading the vault through Nym… (90 second limit)');
  const start = performance.now();
  try {
   const result = await readPrivateVault({ address: vaultAddress.trim(), token: VAULT_USDT }, controller.signal);
   if (active.current === controller) setOutput(JSON.stringify(result, null, 2));
  } catch (error) {
   if (active.current === controller) { setFailed(true); setOutput(`${error instanceof Error ? error.message : 'Private read failed.'}\nNo direct fallback was used.`); }
  } finally {
   if (active.current === controller) { active.current = null; setBusy(false); setElapsed(Math.round(performance.now() - start)); }
  }
 }
 return <main className={styles.page}>
  <Link href="/">← Tijori</Link>
  <p className={styles.kicker}>READ-ONLY CONNECTIVITY DIAGNOSTIC</p>
  <h1>Anon RPC test</h1>
  <p>The vault dashboard reads Whitechain balances and Safe configuration through Anon RPC / Nym. This page can test connectivity or run the same vault reader independently.</p>
  <p className={styles.flow}>Application → Anon RPC browser harness → Nym mixnet → RPC endpoint → application</p>
  <dl><dt>Endpoint</dt><dd>{WHITECHAIN_TESTNET.endpoint}</dd><dt>Expected chain</dt><dd>{WHITECHAIN_TESTNET.name} · 1874 (0x752)</dd><dt>Request</dt><dd>eth_chainId · no wallet, transactions, or funds</dd></dl>
  <div className={styles.actions}>
   <button className="primary" disabled={busy} onClick={() => void run('normal')}>Run connectivity test</button>
   <button className="light-btn" disabled={busy} onClick={() => void run('bootstrap-failure')}>Test bootstrap failure</button>
   <button className="light-btn" disabled={busy} onClick={() => void run('timeout')}>Test timeout</button>
   {busy && <button className="light-btn" onClick={() => active.current?.abort()}>Cancel</button>}
  </div>
  <label>Whitechain Safe address<input value={vaultAddress} disabled={busy} onChange={event => setVaultAddress(event.target.value)} placeholder="0x…" /></label>
  <button className="light-btn" disabled={busy || !vaultAddress.trim()} onClick={() => void runVault()}>Read vault via Nym</button>
  <p className={styles.hint}>Reads the public USDT balance, WBT balance, owners, threshold, nonce and guard. No login, signature or transaction is required.</p>
  <p className={styles.hint}>Failure controls run locally without contacting the target RPC. Timeout test waits 1 second. Every run disposes its harness; leaving this page cancels it.</p>
  <section aria-live="polite" aria-busy={busy} className={styles.result}>
   <h2>{busy ? 'Connecting' : failed ? 'Error' : elapsed === null ? 'Status' : 'Response'}</h2>
   <pre>{output}</pre>{elapsed !== null && <p>{elapsed} ms · harness cleaned up</p>}
  </section>
  <p className={styles.hint}>No direct RPC fallback. Ethereum specifier bootstrap and worker bundle retrieval use direct connections and can reveal your IP to those services. A successful response alone does not prove IP anonymity.</p>
  <p className={styles.hint}>Network details: <a href="https://docs.whitechain.io/learn/network/testnet">Whitechain testnet reference</a> · Worker: <a href="https://nym.com/docs/developers/anon-rpc">Nym documentation</a></p>
 </main>;
}
