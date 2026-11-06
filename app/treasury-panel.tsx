'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, AudioLines, Check, CheckCircle2, Copy, Download, FileText, Fuel, Radio, ScanLine, ShieldCheck, Users, Wallet, X } from 'lucide-react';
import { tichori, type ApplicationState, type ApprovalSession, type RelayerStatus, type SafeStatus } from '@/lib/api/client';
import { unlockIdentityAccount, type KeyEnvelope } from '@/lib/identity-key';
import { sessionSigner, setSessionSigner } from '@/lib/session-signer';
import { explorerAddress, explorerTx, formatUsdt } from '@/lib/whitechain/chain';
import { inboxKeyMessage, safeTxTypedData } from '@/lib/whitechain/safe-tx';
import ObjectCapture from './components/ObjectCapture';
import { DINO_OBJECT_NAME, unlockObjectIdentityAccount, verifyObjectRecovery, type ObjectRecovery } from '@/lib/dino-wallet';
import { listDeviceIdentities, listServerIdentities } from '@/lib/device-identities';
import type { DinoFeatures } from '@/lib/dino';

type Group = ApplicationState['groups'][number];
type Identity = { id: string; name: string; address: string | null };
type Presence = { challengeId: string; code: string; expiresAt: string };
declare global {
 interface Window {
  /** Ultrasonic integration point: resolve with the code heard in the room for this challenge. */
  tichoriPresence?: { listen(challengeId: string): Promise<string> };
 }
}
const short = (s: string) => (s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s);
const secondsLeft = (iso: string, now: number) => Math.max(0, Math.round((Date.parse(iso) - now) / 1000));

export function TreasuryPanel({ vault, data, me, onState, notify, fail }: { vault: Group; data: ApplicationState; me: Identity; onState: (s: ApplicationState) => void; notify: (m: string) => void; fail: (m: string) => void }) {
 const [status, setStatus] = useState<SafeStatus | null>(null), [gas, setGas] = useState<RelayerStatus | null>(null), [sessions, setSessions] = useState<ApprovalSession[]>([]);
 const [modal, setModal] = useState<'propose' | 'approve' | 'inbox' | null>(null), [active, setActive] = useState<ApprovalSession | null>(null), [emitting, setEmitting] = useState<Presence | null>(null);
 const [to, setTo] = useState(''), [amount, setAmount] = useState(''), [note, setNote] = useState(''), [objectName, setObjectName] = useState(''), [passphrase, setPassphrase] = useState('');
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [recovery, setRecovery] = useState<ObjectRecovery | null | undefined>(undefined), [features, setFeatures] = useState<DinoFeatures | null>(null), [inbox, setInbox] = useState<{ inboxKey: string; webhookSecret: string; endpoint: string } | null>(null), [now, setNow] = useState(0);
 const refresh = useCallback(async () => {
  try { setStatus(await tichori.balance(vault.id)); } catch { /* shown as unavailable */ }
  try { setGas(await tichori.relayer()); } catch { /* optional */ }
 }, [vault.id]);
 const poll = useCallback(async () => {
  try { const r = await tichori.sessions(me.id); setSessions(r.sessions.filter(s => s.vaultId === vault.id)); } catch { /* transient */ }
 }, [me.id, vault.id]);
 useEffect(() => { const first = setTimeout(() => { setNow(Date.now()); void refresh(); void poll(); }, 0); const id = setInterval(() => { setNow(Date.now()); void poll(); }, 3000); return () => { clearTimeout(first); clearInterval(id); }; }, [refresh, poll]);
 useEffect(() => {
  if (modal !== 'approve' && modal !== 'inbox') return;
  let live = true;
  // Object identities (camera + on-device DINOv2) are matched here; passphrase identities fall back to the form.
  Promise.all([listServerIdentities().catch(() => []), listDeviceIdentities().catch(() => [])]).then(([server, local]) => {
   const mine = [...server, ...local].find(item => item.recovery.address.toLowerCase() === me.address?.toLowerCase());
   if (live) setRecovery(mine?.recovery ?? null);
  });
  return () => { live = false; };
 }, [modal, me.address]);
 const proposals = data.proposals.filter(p => p.group_id === vault.id), invoices = data.invoices.filter(i => i.group_id === vault.id);
 const live = sessions.find(s => s.status === 'open' || s.status === 'executing' || s.status === 'submitted');
 const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); } };

 async function propose(invoiceId?: string) {
  await run(async () => {
   const result = await tichori.propose(invoiceId ? { vaultId: vault.id, proposerId: me.id, invoiceId } : { vaultId: vault.id, proposerId: me.id, to: to.trim(), amount: amount.trim(), note: note.trim() }, crypto.randomUUID());
   onState(result); setModal(null); setTo(''); setAmount(''); setNote(''); notify('Payment proposed. Gather a majority of signers in one room and start an approval session.');
  });
 }
 async function start(proposalId: string) {
  await run(async () => {
   const { session, emit } = await tichori.startSession(proposalId, me.id);
   setEmitting(emit); setSessions(list => [session, ...list.filter(s => s.id !== session.id)]);
   // Hand the code to the ultrasonic emitter (teammate integration); the demo shows it on screen.
   window.dispatchEvent(new CustomEvent('tichori:presence-emit', { detail: emit }));
   notify('Approval session started. Everyone in the room can approve for the next two minutes.');
  });
 }
 async function heardCode(session: ApprovalSession) {
  if (window.tichoriPresence) return window.tichoriPresence.listen(session.presence.challengeId);
  if (emitting?.challengeId === session.presence.challengeId) return emitting.code;
  if ('simulatedCode' in session.presence && session.presence.simulatedCode) return session.presence.simulatedCode;
  throw new Error('No room code heard yet. Stay near the person who started the session.');
 }
 /** Verify the person (object on this device, or passphrase identity) and return their in-memory signer. */
 async function verifyMe() {
  if (!me.address) throw new Error('This identity has no address.');
  if (recovery) {
   if (!features) throw new Error('Show your object to the camera first.');
   await verifyObjectRecovery(recovery, features); // throws when the object does not match
   const signer = sessionSigner(me.address) ?? await unlockObjectIdentityAccount(recovery, recovery.keyEnvelope);
   setSessionSigner(signer); setFeatures(null);
   return { signer, objectName: DINO_OBJECT_NAME };
  }
  if (!objectName.trim()) throw new Error('Show your personal object (enter its description for this older identity).');
  let signer = sessionSigner(me.address);
  if (!signer) {
   if (passphrase.length < 12) throw new Error('Enter your key passphrase to unlock your signer.');
   const login = await tichori.mutate('login', { address: me.address, objectName: objectName.trim() }, crypto.randomUUID());
   signer = await unlockIdentityAccount(me.address, login.keyEnvelope as KeyEnvelope, passphrase);
   setSessionSigner(signer); setPassphrase('');
  }
  return { signer, objectName: objectName.trim() };
 }
 async function approve(session: ApprovalSession) {
  await run(async () => {
   const { signer, objectName: objectMarker } = await verifyMe();
   const t = session.safeTx;
   const signature = await signer.signTypedData(safeTxTypedData(session.chainId, session.safe, { ...t, value: BigInt(t.value), safeTxGas: BigInt(t.safeTxGas), baseGas: BigInt(t.baseGas), gasPrice: BigInt(t.gasPrice), nonce: BigInt(t.nonce) }));
   const code = await heardCode(session);
   const result = await tichori.approveInSession({ sessionId: session.id, walletId: me.id, objectName: objectMarker, signature, evidence: { reference: code, challengeId: session.presence.challengeId } });
   onState(result); setSessions(list => list.map(s => (s.id === result.session.id ? result.session : s))); setActive(result.session); setObjectName('');
   if (result.session.status === 'executed') { setModal(null); setEmitting(null); notify(`Paid ${result.session.proposal?.amount} USDT on Whitechain. The vault covered the network fee.`); void refresh(); }
   else if (result.session.status === 'failed') setError(result.session.error || 'The payout failed on-chain.');
  });
 }
 async function issueInbox() {
  await run(async () => {
   const { signer } = await verifyMe(), issuedAt = new Date().toISOString();
   const signature = await signer.signMessage({ message: inboxKeyMessage(vault.id, me.id, issuedAt) });
   setInbox(await tichori.inboxKey({ vaultId: vault.id, identityId: me.id, issuedAt, signature })); setObjectName('');
  });
 }
 const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); notify('Copied.'); } catch { fail('Could not copy.'); } };
 const ownerName = (address: string) => data.wallets.find(w => w.address === address.toLowerCase())?.name ?? short(address);

 const identityCheck = () => recovery === undefined ? <p className="form-hint">Loading your identity…</p>
  : recovery ? <><p className="form-hint">Show the object you registered with. It is matched on this device.</p><ObjectCapture isolate={!!recovery.objectProfile} autoProcess disabled={busy} onFeatures={setFeatures} /></>
  : <><label>Show your personal object<input value={objectName} onChange={e => setObjectName(e.target.value)} placeholder="Your registered object description" /></label>
   {!sessionSigner(me.address) && <label>Key passphrase<input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} autoComplete="current-password" /></label>}</>;
 return <>
  <div className="portfolio"><div className="portfolio-main"><div className="portfolio-label">TREASURY BALANCE <span>✳</span></div><div className="portfolio-amount">{status?.balanceUsdt ?? '—'} <span>{status?.rehearsalToken ? 'rUSD' : 'USDT'}</span></div>
   {status?.rehearsalToken && <p className="rehearsal-flag">REHEARSAL TOKEN: Tichori Rehearsal Dollar, not hackathon USDT. Payments in it do not qualify.</p>}
   <p>{status ? <>On Whitechain Sepolia · {status.threshold} of {status.owners.length} signers, together, to pay</> : 'Loading the vault from Whitechain…'}</p>
   <div className="portfolio-actions"><button onClick={() => { setError(''); setModal('propose'); }}><ArrowUpRight size={16} /> Propose payment</button><button onClick={() => { setError(''); setModal('inbox'); }}><FileText size={16} /> Invoice inbox</button></div></div>
   <div className="portfolio-art"><div className="portfolio-orbit"><ShieldCheck size={45} strokeWidth={1.2} /></div></div><div className="portfolio-note">WHITECHAIN</div></div>
  <div className="balance-note">{status?.guard ? <><ShieldCheck size={14} /> Presence guard active: payouts need a majority approving together in one session. Gas is paid by Tichori and refunded by the vault in USDT.</> : 'Checking the presence guard…'}</div>
  {live && <ApprovalCard session={live} me={me} emitting={emitting} now={now} onOpen={() => { setActive(live); setError(''); setModal('approve'); }} />}
  <div className="vault-address"><div><span>VAULT ADDRESS</span><strong>{vault.safe!.address}</strong><small><a href={explorerAddress(vault.safe!.address)} target="_blank" rel="noreferrer">View on Whitechain explorer</a></small></div><button className="light-btn" onClick={() => void copy(vault.safe!.address)}><Copy size={15} /> Copy address</button></div>
  <section className="activity"><div className="section-heading"><div><div className="section-kicker">PAYOUTS</div><h2>Proposals <span>{proposals.length}</span></h2></div><a className="light-btn" href={tichori.exportUrl(vault.id, me.id)}><Download size={15} /> Export CSV</a></div>
   {proposals.length === 0 ? <div className="empty-activity"><div className="empty-icon"><AudioLines size={22} /></div><div><strong>No payouts yet.</strong><p>Propose a payment, then approve it together.</p></div></div> :
    <div className="tx-list">{proposals.map(p => <div className="tx-row" key={p.id}><div className="tx-icon"><ArrowUpRight size={19} /></div><div className="tx-info"><strong>{formatUsdt(p.amount)} USDT to {invoices.find(i => i.id === p.invoice_id)?.vendor_name ?? short(p.to)}</strong><small>{p.proposer_name} · {p.note || 'No note'}{p.approvers.length ? ` · approved together by ${p.approvers.map(a => a.name).join(', ')}` : ''}</small></div>
     <div className="tx-amount">{p.status === 'pending' ? <button className="light-btn" disabled={busy || !!live} onClick={() => void start(p.id)}><Radio size={15} /> Start approval session</button> : <><small className={p.status === 'executed' ? 'success' : 'pending'}>{p.status === 'executed' ? 'Paid' : 'Failed'}</small>{p.tx_hash && <a href={explorerTx(p.tx_hash)} target="_blank" rel="noreferrer">Receipt</a>}</>}</div></div>)}</div>}
  </section>
  <section className="activity"><div className="section-heading"><div><div className="section-kicker">BILLS FROM VENDORS</div><h2>Invoice inbox <span>{invoices.filter(i => i.status === 'open').length}</span></h2></div></div>
   {invoices.length === 0 ? <div className="empty-activity"><div className="empty-icon"><FileText size={22} /></div><div><strong>No invoices yet.</strong><p>Give vendors your inbox key so they can bill this vault.</p></div></div> :
    <div className="tx-list">{invoices.map(i => { const overdue = i.status === 'open' && now > 0 && Date.parse(i.due_date + 'T23:59:59Z') < now; const pending = proposals.some(p => p.invoice_id === i.id && p.status === 'pending'); return <div className="tx-row" key={i.id}><div className="tx-icon"><FileText size={19} /></div><div className="tx-info"><strong>{i.vendor_name} · {formatUsdt(i.amount)} USDT</strong><small>{i.memo || 'No memo'} · due {i.due_date}{overdue ? ' · OVERDUE' : ''}{i.reminders ? ` · ${i.reminders} reminder${i.reminders > 1 ? 's' : ''}` : ''}</small></div>
     <div className="tx-amount">{i.status === 'paid' ? <><small className="success">Paid</small><a href={`/invoice/${i.id}`} target="_blank" rel="noreferrer">Receipt</a></> : pending ? <small className="pending">Proposed</small> : <button className="light-btn" disabled={busy} onClick={() => void propose(i.id)}><ArrowUpRight size={15} /> Propose payment</button>}</div></div>; })}</div>}
  </section>
  <section className="vault-members"><div className="section-heading"><div><div className="section-kicker">THE PEOPLE IN THIS VAULT</div><h2>Signers <span>{status?.owners.length ?? vault.members.length}</span></h2></div></div>
   <div className="member-list">{(status?.owners ?? vault.members.map(m => m.address ?? '')).map((address, i) => <div className="member-row" key={address}><span className={'mini-avatar color' + i % 3}><Users size={15} /></span><span><strong>{ownerName(address)}</strong><small>{address}</small></span>{address.toLowerCase() === me.address && <span className="member-you">YOU</span>}</div>)}</div></section>
  <section className="vault-members"><div className="section-heading"><div><div className="section-kicker">WHO PAYS THE GAS</div><h2><Fuel size={18} /> Gas tank</h2></div></div>
   {gas?.configured ? <div className="details"><div><span>Relayer</span><strong>{short(gas.address)}</strong></div><div><span>WBT left</span><strong>{Number(gas.balanceWbt).toFixed(4)} WBT (~{gas.transactionsLeft} payouts)</strong></div><div><span>Sponsored transactions</span><strong>{gas.sponsoredTransactions}</strong></div><div><span>Refunded by vaults</span><strong>{gas.refundsReceivedUsdt} USDT</strong></div><div><span>Limits</span><strong>≤{gas.limits.maxFeeGwei} gwei · {gas.limits.dailyExecutionsPerVault}/vault/day</strong></div></div> : <p className="form-hint">The relayer is not configured on this server.</p>}
  </section>

  {modal && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><div className="modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => setModal(null)} aria-label="Close"><X size={19} /></button>
   {modal === 'propose' && <><div className="modal-icon"><ArrowUpRight /></div><div className="section-kicker">PAY FROM THE TREASURY</div><h2>Propose a payment</h2><p className="modal-desc">Nothing moves until a majority of signers approve together in one approval session.</p>
    <label>Recipient address<input value={to} onChange={e => setTo(e.target.value)} placeholder="0x…" /></label><label>Amount (USDT)<input value={amount} onChange={e => setAmount(e.target.value)} placeholder="500" inputMode="decimal" /></label><label>Note <span className="optional">optional</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="What is this for?" /></label>
    <button className="submit" disabled={busy} onClick={() => void propose()}>Propose payment <ArrowUpRight size={17} /></button></>}
   {modal === 'approve' && active && <><div className="modal-icon"><ScanLine /></div><div className="section-kicker">APPROVE TOGETHER</div><h2>{active.proposal?.amount} USDT to {active.proposal?.vendor ?? short(active.proposal?.to ?? '')}</h2><p className="modal-desc">{active.proposal?.note || 'No note'} · network fee up to {active.maxNetworkFeeUsdt} USDT, paid by the vault.</p>
    <div className="details"><div><span>Session</span><strong>{active.approvals.length} of {active.threshold} approved · {secondsLeft(active.expiresAt, now)}s left</strong></div><div><span>Presence</span><strong>{active.presence.mode === 'simulated' ? 'Room code received (simulated ultrasound)' : 'Listening for the room code…'}</strong></div></div>
    {active.approvedByMe ? <p className="form-hint"><CheckCircle2 size={14} /> You approved. Waiting for the others in the room.</p> : <>
     {identityCheck()}
     <div className="mock-box"><ScanLine size={20} /><div><strong>{recovery ? 'Your object is matched on this device' : 'Older passphrase identity'}</strong><small>Your key then signs this exact payment in the browser. The server never sees it. The room code is simulated in this build.</small></div></div>
     <button className="submit" disabled={busy || active.status !== 'open' || recovery === undefined || (!!recovery && !features)} onClick={() => void approve(active)}>Approve together <Check size={17} /></button></>}</>}
   {modal === 'inbox' && <><div className="modal-icon"><FileText /></div><div className="section-kicker">LET VENDORS BILL THIS VAULT</div><h2>Invoice inbox key</h2><p className="modal-desc">Vendors use this key with the @tichori/invoices SDK. Paid invoices notify them by signed webhook with the Whitechain receipt.</p>
    {inbox ? <div className="details"><div><span>Inbox key</span><strong className="mono">{inbox.inboxKey}</strong></div><div><span>Webhook secret</span><strong className="mono">{inbox.webhookSecret}</strong></div><div><span>Endpoint</span><strong className="mono">POST {inbox.endpoint}</strong></div><button className="light-btn" onClick={() => void copy(`TICHORI_INBOX_KEY=${inbox.inboxKey}\nTICHORI_WEBHOOK_SECRET=${inbox.webhookSecret}`)}><Copy size={15} /> Copy as env</button></div>
     : <>{identityCheck()}
      <p className="form-hint">Your identity key signs this request in the browser. The key and webhook secret are shown once here.</p>
      <button className="submit" disabled={busy || recovery === undefined || (!!recovery && !features)} onClick={() => void issueInbox()}>Show inbox key <Wallet size={17} /></button></>}</>}
   {error && <div className="error modal-error">{error}</div>}
  </div></div>}
  {error && !modal && <div className="error">{error}</div>}
 </>;
}

function ApprovalCard({ session, me, emitting, now, onOpen }: { session: ApprovalSession; me: Identity; emitting: Presence | null; now: number; onOpen: () => void }) {
 const broadcasting = emitting?.challengeId === session.presence.challengeId;
 return <div className="signal-banner session-card"><Radio size={22} /><div><strong>Approval session · {session.proposal?.amount} USDT to {session.proposal?.vendor ?? short(session.proposal?.to ?? '')}</strong>
  <small>{session.status === 'open' ? `${session.approvals.length} of ${session.threshold} present and approved${session.approvals.length ? ` (${session.approvals.map(a => a.name).join(', ')})` : ''} · ${secondsLeft(session.expiresAt, now)}s left` : session.status === 'executing' || session.status === 'submitted' ? 'Quorum reached. Paying on Whitechain…' : session.status}</small>
  {broadcasting && <small>Broadcasting the room code (simulated ultrasound): <span className="mono">{emitting!.code}</span></small>}</div>
  {session.status === 'open' && <button className="light-btn" onClick={onOpen}>{session.approvedByMe ? 'View' : me.name ? 'Approve' : 'Open'}</button>}</div>;
}
