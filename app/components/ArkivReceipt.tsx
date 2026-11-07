'use client';

import { useEffect, useState } from 'react';
import { useIdentity, useTijori } from '@tijori/react';
import { ArrowUpRight, CheckCircle2, Database } from 'lucide-react';

type Receipt = { persisted: boolean; storageMode: string; transactionReceiptVerified?: boolean; transactionHash?: string; entityKey?: string; revision?: string };

export default function ArkivReceipt() {
 const { identity } = useIdentity();
 const { localStorageMode } = useTijori();
 const [receipt, setReceipt] = useState<Receipt | null>(null);
 const [error, setError] = useState(false);
 const [attempt, setAttempt] = useState(0);
 const identityId = identity?.id;
 useEffect(() => {
  if (!identityId || localStorageMode) return;
  const controller = new AbortController();
  async function load() {
   setReceipt(null); setError(false);
   try {
    const response = await fetch(`/api/storage-proof?identityId=${encodeURIComponent(identityId!)}`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Receipt unavailable');
    const result: Receipt = await response.json();
    if (!controller.signal.aborted) setReceipt(result);
   } catch { if (!controller.signal.aborted) setError(true); }
  }
  void load();
  return () => controller.abort();
 }, [identityId, localStorageMode, attempt]);
 if (!identityId || localStorageMode) return null;
 const verified = receipt?.persisted && receipt.transactionReceiptVerified && /^0x[\da-f]{64}$/i.test(receipt.transactionHash ?? '');
 return <section className="arkiv-receipt" aria-label="Arkiv storage receipt">
  <div className="arkiv-receipt-icon" aria-hidden="true">{verified ? <CheckCircle2 size={21} /> : <Database size={21} />}</div>
  <div className="arkiv-receipt-body">
   <h3>{verified ? 'Your identity is stored on Arkiv' : error ? 'Storage receipt unavailable' : receipt ? 'No confirmed storage receipt yet' : 'Checking your storage receipt…'}</h3>
   <p>{verified ? 'Your encrypted record is included in the application state. View the latest storage transaction on Rabdi.' : error ? 'We couldn’t verify the receipt. You can try again.' : receipt ? 'Refresh the receipt after your registration has been confirmed.' : 'Reading the record and transaction confirmation from Rabdi.'}</p>
   {verified && <small>Encrypted application state · Revision {receipt.revision}</small>}
  </div>
  {verified ? <a className="arkiv-receipt-link" href={`https://rabdi.explorer.arkiv.network/tx/${receipt.transactionHash}`} target="_blank" rel="noopener noreferrer">View on explorer <ArrowUpRight size={16} aria-hidden="true" /></a>
   : (error || receipt) && <button className="arkiv-receipt-link" type="button" onClick={() => setAttempt(value => value + 1)}>Refresh receipt</button>}
 </section>;
}
