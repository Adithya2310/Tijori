'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, AudioLines, CheckCircle2, Copy, Download, FileText, Fuel, KeyRound, Mic, Radio, ShieldCheck, Users, Wallet, X } from 'lucide-react';
import type { ApplicationState, ApprovalSession, RelayerStatus, SafeStatus, TijoriClient } from '@tijori/client';
import { unlockIdentityAccount, type KeyEnvelope } from '@tijori/core/identity-key';
import { sessionSigner, setSessionSigner } from '@tijori/client';
import { explorerAddress, explorerTx, formatUsdt } from '@tijori/core/whitechain/chain';
import { inboxKeyMessage, safeTxTypedData } from '@tijori/core/whitechain/safe-tx';
import ObjectCapture from './ObjectCapture.tsx';
import { useTijori, type IdentityKind, type PresenceEmit, type PresenceListener } from '../context.tsx';
import { useAcoustic } from '../acoustic.ts';
import { listObjectUsernames, unlockObjectIdentityV2, type ObjectScanResult } from '@tijori/client';
import { OBJECT_IDENTITY_NAME, packObjectQuery } from '@tijori/core/object-profile';

type Group = ApplicationState['groups'][number];
type Identity = { id: string; name: string; address: string | null };
type Signer = NonNullable<ReturnType<typeof sessionSigner>>;
/** Ultrasonic integration point on window (tichoriPresence is the deprecated name). Prefer <TijoriProvider presence>. */
const windowPresence = (): PresenceListener | undefined => { const scope = window as unknown as { tijoriPresence?: PresenceListener; tichoriPresence?: PresenceListener }; return scope.tijoriPresence ?? scope.tichoriPresence; };
const short = (s: string) => (s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s);
const secondsLeft = (iso: string, now: number) => Math.max(0, Math.round((Date.parse(iso) - now) / 1000));
const isLive = (s: ApprovalSession) => s.status === 'open' || s.status === 'executing' || s.status === 'submitted';
const together = (threshold: number, owners: number) => (threshold >= owners ? `all ${owners} members` : `${threshold} of ${owners} members`);

/**
 * Whitechain treasury for one vault: USDT balance, proposals, the acoustic payment check, the vendor invoice inbox,
 * signers and the relayer gas tank. A payout runs after the vault's members are together: the initiator's device
 * plays a payment code, every member's device hears it and their own key (unlocked by their object login) signs.
 */
export function VaultTreasury({ vaultId }: { vaultId: string }) {
 const { client, data, identity, setData, setNotice, setError, receiptUrl, presence, onPresenceEmit, identityKind } = useTijori();
 const vault = data.groups.find(g => g.id === vaultId);
 if (!vault?.safe || vault.safe.chainId !== 1874 || !identity) return null;
 return <TreasuryPanel key={vault.id} tijori={client} vault={vault} data={data} me={identity} onState={setData} notify={setNotice} fail={setError} receiptUrl={receiptUrl} presence={presence} onPresenceEmit={onPresenceEmit} identityKind={identityKind} />;
}

function TreasuryPanel({ tijori, vault, data, me, onState, notify, fail, receiptUrl, presence, onPresenceEmit, identityKind }: { identityKind: IdentityKind | null; tijori: TijoriClient; vault: Group; data: ApplicationState; me: Identity; onState: (s: ApplicationState) => void; notify: (m: string) => void; fail: (m: string) => void; receiptUrl: (id: string) => string; presence?: PresenceListener; onPresenceEmit?: (emit: PresenceEmit) => void }) {
 const [status, setStatus] = useState<SafeStatus | null>(null), [gas, setGas] = useState<RelayerStatus | null>(null), [sessions, setSessions] = useState<ApprovalSession[]>([]);
 const [modal, setModal] = useState<'propose' | 'inbox' | 'unlock' | null>(null), [emitting, setEmitting] = useState<PresenceEmit | null>(null), [ultrasound, setUltrasound] = useState(false);
 const [to, setTo] = useState(''), [amount, setAmount] = useState(''), [note, setNote] = useState(''), [objectName, setObjectName] = useState(''), [passphrase, setPassphrase] = useState('');
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [objectIdentity, setObjectIdentity] = useState<boolean | undefined>(identityKind ? identityKind === 'object' : undefined), [photo, setPhoto] = useState<ObjectScanResult | null>(null), [inbox, setInbox] = useState<{ inboxKey: string; webhookSecret: string; endpoint: string } | null>(null), [now, setNow] = useState(0);
 const audio = useAcoustic(), stopAudio = audio.stop;
 // The session this device takes part in: when it leaves "open", audio stops and the outcome is announced once.
 const watched = useRef<{ id: string; status: string } | null>(null);
 const refresh = useCallback(async () => {
  try { setStatus(await tijori.balance(vault.id)); } catch { /* shown as unavailable */ }
  try { setGas(await tijori.relayer()); } catch { /* optional */ }
 }, [tijori, vault.id]);
 const settle = useCallback((session: ApprovalSession) => {
  watched.current = null; stopAudio(); setEmitting(null);
  if (session.status === 'executed') { notify(`Paid ${session.proposal?.amount} USDT on Whitechain. Every member's device heard the payment code; the vault covered the network fee.`); void refresh(); }
  else if (session.status === 'failed') setError(session.error || 'The payout failed on-chain.');
  else if (session.status === 'expired') setError('The payment check expired before every member joined. Start it again when everyone is together.');
 }, [notify, refresh, stopAudio]);
 const poll = useCallback(async () => {
  try {
   const list = (await tijori.sessions(me.id)).sessions.filter(s => s.vaultId === vault.id);
   setSessions(list);
   const mine = watched.current && list.find(s => s.id === watched.current!.id);
   if (mine && mine.status !== watched.current!.status) {
    watched.current = { id: mine.id, status: mine.status };
    if (mine.status !== 'open') stopAudio();
    if (!isLive(mine)) settle(mine);
   }
  } catch { /* transient */ }
 }, [tijori, me.id, vault.id, settle, stopAudio]);
 useEffect(() => { const first = setTimeout(() => { setNow(Date.now()); void refresh(); void poll(); }, 0); const id = setInterval(() => { setNow(Date.now()); void poll(); }, 2000); return () => { clearTimeout(first); clearInterval(id); }; }, [refresh, poll]);
 useEffect(() => {
  if (objectIdentity !== undefined) return;
  let live = true;
  // Scanner v2 identities unlock their key with a photo; older passphrase identities with their passphrase.
  listObjectUsernames(tijori).then(list => { if (live) setObjectIdentity(list.some(item => item.address === me.address)); }, () => { if (live) setObjectIdentity(false); });
  return () => { live = false; };
 }, [tijori, me.address, objectIdentity]);
 const proposals = data.proposals.filter(p => p.group_id === vault.id), invoices = data.invoices.filter(i => i.group_id === vault.id);
 const live = sessions.find(isLive);
 const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); } };
 const marker = () => (objectIdentity === false ? objectName.trim() : OBJECT_IDENTITY_NAME);

 /** The key unlocked at login for this visit. After a reload it is gone: ask to unlock it once, then retry. */
 function signerOrUnlock(): Signer | null {
  const signer = me.address ? sessionSigner(me.address) : null;
  if (signer && (objectIdentity !== false || objectName.trim())) return signer;
  setError(''); setModal('unlock');
  return null;
 }
 async function unlock() {
  await run(async () => {
   if (!me.address) throw new Error('This identity has no address.');
   if (objectIdentity !== false) {
    if (!photo) throw new Error('Show your object to the camera first.');
    // The server matches the photo again and releases the encrypted key, which is unlocked here in the browser.
    const login = await tijori.objectLogin(me.name, packObjectQuery(photo.descriptor), crypto.randomUUID());
    if (!login.objectProfile) throw new Error('The server did not return your identity.');
    setSessionSigner(await unlockObjectIdentityV2(me.address, login.keyEnvelope as KeyEnvelope, login.objectProfile));
    setPhoto(null);
   } else {
    if (!objectName.trim()) throw new Error('Enter your registered object description.');
    if (!sessionSigner(me.address)) {
     if (passphrase.length < 12) throw new Error('Enter your key passphrase to unlock your signer.');
     const login = await tijori.mutate('login', { address: me.address, objectName: objectName.trim() }, crypto.randomUUID());
     setSessionSigner(await unlockIdentityAccount(me.address, login.keyEnvelope as KeyEnvelope, passphrase)); setPassphrase('');
    }
   }
   setModal(null); notify('Your key is unlocked for this visit. Tap the button again.');
  });
 }
 async function propose(invoiceId?: string) {
  await run(async () => {
   const result = await tijori.propose(invoiceId ? { vaultId: vault.id, proposerId: me.id, invoiceId } : { vaultId: vault.id, proposerId: me.id, to: to.trim(), amount: amount.trim(), note: note.trim() }, crypto.randomUUID());
   onState(result); setModal(null); setTo(''); setAmount(''); setNote(''); notify('Payment proposed. When every member is together, tap Start payment check.');
  });
 }
 /** Sign this exact Safe transaction with the member's own key and send it with the code this device heard. */
 async function approveWith(session: ApprovalSession, code: string, signer: Signer) {
  const t = session.safeTx;
  const signature = await signer.signTypedData(safeTxTypedData(session.chainId, session.safe, { ...t, value: BigInt(t.value), safeTxGas: BigInt(t.safeTxGas), baseGas: BigInt(t.baseGas), gasPrice: BigInt(t.gasPrice), nonce: BigInt(t.nonce) }));
  const result = await tijori.approveInSession({ sessionId: session.id, walletId: me.id, objectName: marker(), signature, evidence: { reference: code, challengeId: session.presence.challengeId } });
  onState(result); setSessions(list => list.map(s => (s.id === result.session.id ? result.session : s)));
  if (!isLive(result.session)) settle(result.session);
  else if (watched.current?.id === result.session.id) watched.current = { id: result.session.id, status: result.session.status };
  return result.session;
 }
 /** Initiator: open the session, play the code on this device's speaker and approve (this device is in the room). */
 async function startCheck(proposalId: string) {
  const signer = signerOrUnlock();
  if (!signer) return;
  await run(async () => {
   // Start audio inside the tap, before any network request (mobile browsers require a user gesture).
   if (!onPresenceEmit) await audio.prime();
   const { session, emit } = await tijori.startSession(proposalId, me.id);
   watched.current = { id: session.id, status: session.status };
   setEmitting(emit); setSessions(list => [session, ...list.filter(s => s.id !== session.id)]);
   onPresenceEmit?.(emit);
   window.dispatchEvent(new CustomEvent('tijori:presence-emit', { detail: emit }));
   window.dispatchEvent(new CustomEvent('tichori:presence-emit', { detail: emit })); // deprecated event name
   if (!onPresenceEmit) void audio.broadcast(emit.code, { ultrasound, until: Date.parse(emit.expiresAt) }).catch(e => setError(e instanceof Error ? e.message : 'The speaker could not play the payment code.'));
   await approveWith(session, emit.code, signer);
   notify('Payment check started. Every member opens this vault on their own device, near yours, and taps Join payment check.');
  });
 }
 /** Initiator after stopping the sound: play the same code again (only this device knows it). */
 async function replay() {
  if (!emitting) return;
  await run(async () => { await audio.prime(); void audio.broadcast(emitting.code, { ultrasound, until: Date.parse(emitting.expiresAt) }).catch(e => setError(e instanceof Error ? e.message : 'The speaker could not play the payment code.')); });
 }
 /** Member: listen for the payment code, then sign and approve. A wrong decode keeps listening. */
 async function joinCheck(session: ApprovalSession) {
  const signer = signerOrUnlock();
  if (!signer) return;
  await run(async () => {
   watched.current = { id: session.id, status: session.status };
   const listener = presence ?? windowPresence();
   if (listener) { await approveWith(session, await listener.listen(session.presence.challengeId), signer); return; }
   await audio.prime();
   await audio.listen(async code => {
    try {
     const result = await approveWith(session, code, signer);
     setError('');
     if (isLive(result)) notify('Your device heard the payment code and your key signed. Waiting for the other members.');
     return true;
    } catch (e) { setError(`${e instanceof Error ? e.message : 'That code did not match.'} Still listening…`); return false; }
   });
  });
 }
 async function issueInbox() {
  const signer = signerOrUnlock();
  if (!signer) return;
  await run(async () => {
   const issuedAt = new Date().toISOString();
   const signature = await signer.signMessage({ message: inboxKeyMessage(vault.id, me.id, issuedAt) });
   setInbox(await tijori.inboxKey({ vaultId: vault.id, identityId: me.id, issuedAt, signature }));
  });
 }
 const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); notify('Copied.'); } catch { fail('Could not copy.'); } };
 const ownerName = (address: string) => data.wallets.find(w => w.address === address.toLowerCase())?.name ?? short(address);
 const owners = status?.owners ?? vault.members.map(m => m.address ?? '');
 const threshold = status?.threshold ?? owners.length;

 return <>
  <div className="tj-portfolio"><div className="tj-portfolio-main"><div className="tj-portfolio-label">TREASURY BALANCE <span>✳</span></div><div className="tj-portfolio-amount">{status?.balanceUsdt ?? '—'} <span>{status?.rehearsalToken ? 'rUSD' : 'USDT'}</span></div>
   {status?.rehearsalToken && <p className="tj-rehearsal-flag">REHEARSAL TOKEN: Tichori Rehearsal Dollar, not hackathon USDT. Payments in it do not qualify.</p>}
   <p>{status ? <>On Whitechain Sepolia · {together(status.threshold, status.owners.length)}, together, to pay</> : 'Loading the vault from Whitechain…'}</p>
   <div className="tj-portfolio-actions"><button onClick={() => { setError(''); setModal('propose'); }}><ArrowUpRight size={16} /> Propose payment</button><button onClick={() => { setError(''); setModal('inbox'); }}><FileText size={16} /> Invoice inbox</button></div></div>
   <div className="tj-portfolio-art"><div className="tj-portfolio-orbit"><ShieldCheck size={45} strokeWidth={1.2} /></div></div><div className="tj-portfolio-note">WHITECHAIN</div></div>
  <div className="tj-balance-note">{status?.guard ? <><ShieldCheck size={14} /> Presence guard active: a payout runs only after {together(status.threshold, status.owners.length)} hear the payment code on their own devices in one check. Gas is paid by the Tijori relayer and refunded by the vault in USDT.</> : 'Checking the presence guard…'}</div>
  {live && <PaymentCheck session={live} me={me} owners={owners.map(ownerName)} threshold={threshold} now={now} busy={busy} mode={audio.mode} level={audio.level} canReplay={!!emitting && emitting.challengeId === live.presence.challengeId && !onPresenceEmit} ultrasound={ultrasound}
   onJoin={() => void joinCheck(live)} onReplay={() => void replay()} onStop={stopAudio} onRestart={() => live.proposal && void startCheck(live.proposal.id)} />}
  <div className="tj-vault-address"><div><span>VAULT ADDRESS</span><strong>{vault.safe!.address}</strong><small><a href={explorerAddress(vault.safe!.address)} target="_blank" rel="noreferrer">View on Whitechain explorer</a></small></div><button className="tj-light-btn" onClick={() => void copy(vault.safe!.address)}><Copy size={15} /> Copy address</button></div>
  <section className="tj-activity"><div className="tj-section-heading"><div><div className="tj-section-kicker">PAYOUTS</div><h2>Proposals <span>{proposals.length}</span></h2></div><a className="tj-light-btn" href={tijori.exportUrl(vault.id, me.id)}><Download size={15} /> Export CSV</a></div>
   {proposals.some(p => p.status === 'pending') && !live && <label className="tj-object-consent"><input type="checkbox" role="switch" checked={ultrasound} onChange={e => setUltrasound(e.target.checked)} /><span>Ultrasound payment code {ultrasound ? 'on (about 15–19.5 kHz, quieter; speaker support varies)' : 'off (audible, most reliable)'}</span></label>}
   {proposals.length === 0 ? <div className="tj-empty-activity"><div className="tj-empty-icon"><AudioLines size={22} /></div><div><strong>No payouts yet.</strong><p>Propose a payment, then approve it together with a payment check.</p></div></div> :
    <div className="tj-tx-list">{proposals.map(p => <div className="tj-tx-row" key={p.id}><div className="tj-tx-icon"><ArrowUpRight size={19} /></div><div className="tj-tx-info"><strong>{formatUsdt(p.amount)} USDT to {invoices.find(i => i.id === p.invoice_id)?.vendor_name ?? short(p.to)}</strong><small>{p.proposer_name} · {p.note || 'No note'}{p.approvers.length ? ` · approved together by ${p.approvers.map(a => a.name).join(', ')}` : ''}</small></div>
     <div className="tj-tx-amount">{p.status === 'pending' ? <button className="tj-light-btn" disabled={busy || !!live} onClick={() => void startCheck(p.id)}><Radio size={15} /> Start payment check</button> : <><small className={p.status === 'executed' ? 'tj-success' : 'tj-pending'}>{p.status === 'executed' ? 'Paid' : 'Failed'}</small>{p.tx_hash && <a href={explorerTx(p.tx_hash)} target="_blank" rel="noreferrer">Receipt</a>}</>}</div></div>)}</div>}
  </section>
  <section className="tj-activity"><div className="tj-section-heading"><div><div className="tj-section-kicker">BILLS FROM VENDORS</div><h2>Invoice inbox <span>{invoices.filter(i => i.status === 'open').length}</span></h2></div></div>
   {invoices.length === 0 ? <div className="tj-empty-activity"><div className="tj-empty-icon"><FileText size={22} /></div><div><strong>No invoices yet.</strong><p>Give vendors your inbox key so they can bill this vault.</p></div></div> :
    <div className="tj-tx-list">{invoices.map(i => { const overdue = i.status === 'open' && now > 0 && Date.parse(i.due_date + 'T23:59:59Z') < now; const pending = proposals.some(p => p.invoice_id === i.id && p.status === 'pending'); return <div className="tj-tx-row" key={i.id}><div className="tj-tx-icon"><FileText size={19} /></div><div className="tj-tx-info"><strong>{i.vendor_name} · {formatUsdt(i.amount)} USDT</strong><small>{i.memo || 'No memo'} · due {i.due_date}{overdue ? ' · OVERDUE' : ''}{i.reminders ? ` · ${i.reminders} reminder${i.reminders > 1 ? 's' : ''}` : ''}</small></div>
     <div className="tj-tx-amount">{i.status === 'paid' ? <><small className="tj-success">Paid</small><a href={receiptUrl(i.id)} target="_blank" rel="noreferrer">Receipt</a></> : pending ? <small className="tj-pending">Proposed</small> : <button className="tj-light-btn" disabled={busy} onClick={() => void propose(i.id)}><ArrowUpRight size={15} /> Propose payment</button>}</div></div>; })}</div>}
  </section>
  <section className="tj-vault-members"><div className="tj-section-heading"><div><div className="tj-section-kicker">THE PEOPLE IN THIS VAULT</div><h2>Signers <span>{owners.length}</span></h2></div></div>
   <div className="tj-member-list">{owners.map((address, i) => <div className="tj-member-row" key={address}><span className={'tj-mini-avatar tj-color' + i % 3}><Users size={15} /></span><span><strong>{ownerName(address)}</strong><small>{address}</small></span>{address.toLowerCase() === me.address && <span className="tj-member-you">YOU</span>}</div>)}</div></section>
  <section className="tj-vault-members"><div className="tj-section-heading"><div><div className="tj-section-kicker">WHO PAYS THE GAS</div><h2><Fuel size={18} /> Gas tank</h2></div></div>
   {gas?.configured ? <div className="tj-details"><div><span>Relayer</span><strong>{short(gas.address)}</strong></div><div><span>WBT left</span><strong>{Number(gas.balanceWbt).toFixed(4)} WBT (~{gas.transactionsLeft} payouts)</strong></div><div><span>Sponsored transactions</span><strong>{gas.sponsoredTransactions}</strong></div><div><span>Refunded by vaults</span><strong>{gas.refundsReceivedUsdt} USDT</strong></div><div><span>Limits</span><strong>≤{gas.limits.maxFeeGwei} gwei · {gas.limits.dailyExecutionsPerVault}/vault/day</strong></div></div> : <p className="tj-form-hint">The relayer is not configured on this server.</p>}
  </section>

  {modal && <div className="tj-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><div className="tj-modal" role="dialog" aria-modal="true"><button className="tj-modal-close" onClick={() => setModal(null)} aria-label="Close"><X size={19} /></button>
   {modal === 'propose' && <><div className="tj-modal-icon"><ArrowUpRight /></div><div className="tj-section-kicker">PAY FROM THE TREASURY</div><h2>Propose a payment</h2><p className="tj-modal-desc">Nothing moves until {together(threshold, owners.length)} are together and their devices hear the payment code.</p>
    <label>Recipient address<input value={to} onChange={e => setTo(e.target.value)} placeholder="0x…" /></label><label>Amount (USDT)<input value={amount} onChange={e => setAmount(e.target.value)} placeholder="500" inputMode="decimal" /></label><label>Note <span className="tj-optional">optional</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="What is this for?" /></label>
    <button className="tj-submit" disabled={busy} onClick={() => void propose()}>Propose payment <ArrowUpRight size={17} /></button></>}
   {modal === 'unlock' && <><div className="tj-modal-icon"><KeyRound /></div><div className="tj-section-kicker">UNLOCK YOUR KEY</div><h2>Show your object</h2><p className="tj-modal-desc">Your key stays unlocked in this browser tab after you log in. After a reload, unlock it once: the server checks your object again and releases your encrypted key, which only this browser decrypts.</p>
    {objectIdentity === undefined ? <p className="tj-form-hint">Loading your identity…</p> : objectIdentity ? <ObjectCapture mode="photo" disabled={busy} onResult={results => setPhoto(results?.[0] ?? null)} />
     : <><label>Your registered object description<input value={objectName} onChange={e => setObjectName(e.target.value)} placeholder="Your registered object description" /></label>
      {!(me.address && sessionSigner(me.address)) && <label>Key passphrase<input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} autoComplete="current-password" /></label>}</>}
    <button className="tj-submit" disabled={busy || objectIdentity === undefined || (!!objectIdentity && !photo)} onClick={() => void unlock()}>Unlock my key <KeyRound size={17} /></button></>}
   {modal === 'inbox' && <><div className="tj-modal-icon"><FileText /></div><div className="tj-section-kicker">LET VENDORS BILL THIS VAULT</div><h2>Invoice inbox key</h2><p className="tj-modal-desc">Vendors use this key with the @tijori/invoices SDK. Paid invoices notify them by signed webhook with the Whitechain receipt.</p>
    {inbox ? <div className="tj-details"><div><span>Inbox key</span><strong className="tj-mono">{inbox.inboxKey}</strong></div><div><span>Webhook secret</span><strong className="tj-mono">{inbox.webhookSecret}</strong></div><div><span>Endpoint</span><strong className="tj-mono">POST {inbox.endpoint}</strong></div><button className="tj-light-btn" onClick={() => void copy(`TIJORI_INBOX_KEY=${inbox.inboxKey}\nTIJORI_WEBHOOK_SECRET=${inbox.webhookSecret}`)}><Copy size={15} /> Copy as env</button></div>
     : <><p className="tj-form-hint">Your identity key signs this request in the browser. The key and webhook secret are shown once here.</p>
      <button className="tj-submit" disabled={busy} onClick={() => void issueInbox()}>Show inbox key <Wallet size={17} /></button></>}</>}
   {error && <div className="tj-error tj-modal-error">{error}</div>}
  </div></div>}
  {error && !modal && <div className="tj-error" role="alert">{error}</div>}
 </>;
}

/** The live payment check: who has been heard, the countdown, and this device's part (play the code or listen). */
function PaymentCheck({ session, me, owners, threshold, now, busy, mode, level, canReplay, ultrasound, onJoin, onReplay, onStop, onRestart }: {
 session: ApprovalSession; me: Identity; owners: string[]; threshold: number; now: number; busy: boolean; mode: 'idle' | 'broadcasting' | 'listening'; level: number;
 canReplay: boolean; ultrasound: boolean; onJoin: () => void; onReplay: () => void; onStop: () => void; onRestart: () => void;
}) {
 const heard = new Set(session.approvals.map(a => a.name)), open = session.status === 'open', initiator = session.initiator === me.name;
 const left = secondsLeft(session.expiresAt, now);
 const dial = !open ? 'Paying' : session.approvedByMe && !initiator ? 'Heard' : mode === 'broadcasting' ? 'Playing' : mode === 'listening' ? 'Listening' : initiator ? 'Ready' : 'Join';
 return <div className="tj-payment-check">
  <div className="tj-section-kicker">PAYMENT CHECK · {together(threshold, owners.length).toUpperCase()} TOGETHER</div>
  <h2>{session.proposal?.amount} USDT to {session.proposal?.vendor ?? short(session.proposal?.to ?? '')}</h2>
  <p className="tj-check-status" aria-live="polite">{open ? `${session.approvals.length} of ${threshold} heard the payment code · ${left}s left` : session.status === 'executing' || session.status === 'submitted' ? 'Everyone heard the code. Paying on Whitechain…' : session.status}</p>
  <div className="tj-dial-wrap"><div className="tj-dial"><div className="tj-dial-inner">{mode === 'listening' ? <Mic size={27} /> : <AudioLines size={27} />}<strong className="tj-dial-listening">{dial}</strong><small>{initiator ? (ultrasound ? 'ULTRASOUND CODE' : 'AUDIBLE CODE') : 'PAYMENT CODE'}</small></div></div></div>
  {mode === 'listening' && <label>Microphone level<meter min="0" max="100" value={level} aria-label="Microphone level" /></label>}
  <ul className="tj-check-members">{owners.map(name => <li key={name}><span>{name}{name === me.name ? ' (you)' : ''}</span><span>{name === session.initiator ? 'Playing the code ✓' : heard.has(name) ? 'Heard ✓' : 'Waiting'}</span></li>)}</ul>
  {open && <div className="tj-camera-actions">
   {initiator ? (mode === 'broadcasting' ? <button type="button" className="tj-light-btn" onClick={onStop}>Stop the sound</button>
    : canReplay ? <button type="button" className="tj-primary" disabled={busy} onClick={onReplay}><Radio size={15} /> Play the code again</button>
    : <button type="button" className="tj-primary" disabled={busy} onClick={onRestart}><Radio size={15} /> Start the check again</button>)
    : session.approvedByMe ? <p className="tj-form-hint"><CheckCircle2 size={14} /> Your device heard the code and your key signed. Waiting for the others.</p>
    : mode === 'listening' ? <button type="button" className="tj-light-btn" onClick={onStop}>Stop listening</button>
    : <button type="button" className="tj-primary" disabled={busy} onClick={onJoin}><Mic size={15} /> Join payment check</button>}
  </div>}
  <p className="tj-form-hint">{initiator ? 'Keep this screen open and the volume up, near the other members. Use speakers, not headphones.' : 'Hold your device near the person who started the check and allow the microphone.'} The code is sound in the room: it can be replayed or relayed, so it shows the devices were within earshot, not who holds them.</p>
 </div>;
}
