'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { requestViaNym } from '@tijori/client';
import { WHITECHAIN_TESTNET, verifyTestnetChain, type DiagnosticMode } from '@tijori/client';
import styles from './page.module.css';

export default function AnonRpcDiagnostic() {
 const [busy, setBusy] = useState(false);
 const [output, setOutput] = useState('Ready. No request sent.');
 const [failed, setFailed] = useState(false);
 const [elapsed, setElapsed] = useState<number | null>(null);
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
 return <main className={styles.page}>
  <Link href="/">← Tijori</Link>
  <p className={styles.kicker}>READ-ONLY CONNECTIVITY DIAGNOSTIC</p>
  <h1>Anon RPC test</h1>
  <p>Whitechain is not integrated into Tijori. This isolated test asks a testnet RPC for its chain ID through the published Nym worker.</p>
  <p className={styles.flow}>Application → Anon RPC browser harness → Nym mixnet → RPC endpoint → application</p>
  <dl><dt>Endpoint</dt><dd>{WHITECHAIN_TESTNET.endpoint}</dd><dt>Expected chain</dt><dd>{WHITECHAIN_TESTNET.name} · 1874 (0x752)</dd><dt>Request</dt><dd>eth_chainId · no wallet, transactions, or funds</dd></dl>
  <div className={styles.actions}>
   <button className="primary" disabled={busy} onClick={() => void run('normal')}>Run connectivity test</button>
   <button className="light-btn" disabled={busy} onClick={() => void run('bootstrap-failure')}>Test bootstrap failure</button>
   <button className="light-btn" disabled={busy} onClick={() => void run('timeout')}>Test timeout</button>
   {busy && <button className="light-btn" onClick={() => active.current?.abort()}>Cancel</button>}
  </div>
  <p className={styles.hint}>Failure controls run locally without contacting the target RPC. Timeout test waits 1 second. Every run disposes its harness; leaving this page cancels it.</p>
  <section aria-live="polite" aria-busy={busy} className={styles.result}>
   <h2>{busy ? 'Connecting' : failed ? 'Error' : elapsed === null ? 'Status' : 'Response'}</h2>
   <pre>{output}</pre>{elapsed !== null && <p>{elapsed} ms · harness cleaned up</p>}
  </section>
  <p className={styles.hint}>No direct RPC fallback. Ethereum specifier bootstrap and worker bundle retrieval use direct connections and can reveal your IP to those services. A successful response alone does not prove IP anonymity.</p>
  <p className={styles.hint}>Network details: <a href="https://docs.whitechain.io/learn/network/testnet">Whitechain testnet reference</a> · Worker: <a href="https://nym.com/docs/developers/anon-rpc">Nym documentation</a></p>
 </main>;
}
