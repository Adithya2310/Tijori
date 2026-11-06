'use client';
// Reference-app-only legacy demo features, rendered through @tijori/react slots:
// Base Sepolia Safe vaults (managed in the Safe app), simulated v1 transfers, passphrase identities and
// resuming a pending Base Sepolia deployment. New integrations use Whitechain vaults instead.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowRight, ArrowUpRight, AudioLines, Check, Copy, Radio, Wallet } from 'lucide-react';
import { Modal, useTijori } from '@tijori/react';
import { PENDING_SAFE_KEY, readAnonymousBalance, readPendingSafe, waitForSafe, type ApiTransaction, type ApiVault, type PendingSafe, type SafeStatus } from '@tijori/client';
import PhoneAccess from './components/PhoneAccess';

const short = (s: string) => (s.length > 24 ? `${s.slice(0, 12)}…${s.slice(-7)}` : s);
const subscribeStorage = (onChange: () => void) => { window.addEventListener('storage', onChange); return () => window.removeEventListener('storage', onChange); };

/** Existing passphrase identities keep their original login path. */
export function LegacyPassphraseLogin() {
 const { busy, mutate } = useTijori();
 const [address, setAddress] = useState(''), [passphrase, setPassphrase] = useState(''), [objectName, setObjectName] = useState('');
 return <>
  <label>Public address<input value={address} onChange={e => setAddress(e.target.value)} placeholder="0x…" autoComplete="username" /></label>
  <label>Key passphrase<input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} autoComplete="current-password" /></label>
  <label>Registered object description<input value={objectName} onChange={e => setObjectName(e.target.value)} /></label>
  <p className="tj-form-hint">Existing identities use their original passphrase and simulated object description.</p>
  <button className="tj-submit" disabled={busy} onClick={async () => { if (await mutate('login', { address, objectName }, 'Welcome back.', { passphrase })) setPassphrase(''); }}>Log in <ArrowRight size={17} /></button>
 </>;
}

/** Resume a Base Sepolia Safe deployment that was started in this browser before Whitechain vaults. */
export function PendingSafeResume() {
 const { client, identityId, busy, run, setData, setNotice, error } = useTijori();
 const raw = useSyncExternalStore(subscribeStorage, () => localStorage.getItem(PENDING_SAFE_KEY), () => null);
 const stored = useMemo(() => {
  if (raw === null) return { record: null, invalid: '' };
  try { return { record: readPendingSafe(), invalid: '' }; } catch (e) { return { record: null, invalid: e instanceof Error ? e.message : 'Pending deployment record is invalid.' }; }
 }, [raw]);
 const [override, setPending] = useState<PendingSafe | null | undefined>(undefined), [hash, setHash] = useState('');
 const pending = override !== undefined ? override : stored.record, invalid = override === undefined ? stored.invalid : '';
 if (invalid) return <div className="tj-error">{invalid}</div>;
 if (!pending) return null;
 async function resume() {
  let record = pending!;
  await run(async () => {
   if (!record.deploymentTxHash) {
    if (!/^0x[\da-f]{64}$/i.test(hash.trim())) throw Error('Enter the deployment transaction hash from your wallet.');
    record = { ...record, phase: 'submitted', deploymentTxHash: hash.trim() as `0x${string}` };
    localStorage.setItem(PENDING_SAFE_KEY, JSON.stringify(record)); setPending(record);
   }
   if (record.creatorId !== identityId) throw Error('Log in as the demo identity that started this deployment.');
   await waitForSafe(record);
   const tx = record.deploymentTxHash!;
   const result = await client.mutate('register-safe', { name: record.name, creatorId: record.creatorId, owners: record.owners, saltNonce: record.saltNonce, address: record.address, deploymentTxHash: tx }, 'safe-' + tx.slice(2));
   if (!result.groups.some(item => item.safe?.deploymentTxHash.toLowerCase() === tx.toLowerCase())) throw Error('Safe deployment was recorded but could not be found. Resume this operation.');
   localStorage.removeItem(PENDING_SAFE_KEY); setPending(null); setData(result); setNotice('Safe vault deployed and saved to Arkiv.');
  });
 }
 return <div className="tj-recovery-box"><strong>Base Sepolia vault deployment awaiting confirmation</strong><small>Resume the existing deployment without creating another contract.</small>
  {!pending.deploymentTxHash && <label>Deployment transaction hash<input value={hash} onChange={e => setHash(e.target.value)} placeholder="0x…" /></label>}
  <button className="tj-submit" disabled={busy} onClick={() => void resume()}>Resume deployment <ArrowRight size={17} /></button>{error && <div className="tj-error">{error}</div>}</div>;
}

/** Legacy vault view: Base Sepolia Safes (balance and signers; transactions in the Safe app) or simulated groups. */
export function LegacyVault({ vault }: { vault: ApiVault }) {
 const { client, data, identityId, busy, mutate, run, setError, setNotice } = useTijori();
 const [live, setLive] = useState<SafeStatus | null>(null), [balanceError, setBalanceError] = useState('');
 const [anon, setAnon] = useState<string>(''), [anonBusy, setAnonBusy] = useState(false);
 const [modal, setModal] = useState<'send' | 'receive' | 'details' | null>(null), [selected, setSelected] = useState<ApiTransaction | null>(null);
 const [matching, setMatching] = useState<ApiTransaction[]>([]), [matched, setMatched] = useState(false);
 const [recipient, setRecipient] = useState(''), [amount, setAmount] = useState(''), [asset, setAsset] = useState('ETH'), [note, setNote] = useState('');
 useEffect(() => {
  if (!vault.safe) return;
  let current = true;
  client.balance(vault.id).then(value => { if (current) { setLive(value); setBalanceError(''); } }, () => { if (current) { setLive(null); setBalanceError('Unable to load the Base Sepolia balance.'); } });
  return () => { current = false; };
 }, [client, vault.id, vault.safe]);
 const close = () => { setModal(null); setError(''); setMatched(false); };
 async function listen() {
  setMatched(false); setMatching([]);
  await run(async () => { const result = await client.discover(identityId, vault.id); setMatching(result.requests); setMatched(true); });
 }
 async function checkAnonymous(address: `0x${string}`) {
  setAnonBusy(true); setAnon('Connecting to Nym; this can take a while…');
  try { setAnon(`Anon RPC result: ${await readAnonymousBalance(address)} ETH`); } catch { setAnon('Anon RPC check failed or timed out. No direct fallback was used.'); } finally { setAnonBusy(false); }
 }
 const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setNotice('Address copied.'); } catch { setError('Could not copy the vault address.'); } };
 const transactions = data.transactions.filter(item => item.group_id === vault.id);
 const t = data.transactions.find(x => x.id === selected?.id) || selected;
 const address = vault.safe?.address;
 return <>
  <div className="tj-portfolio"><div className="tj-portfolio-main"><div className="tj-portfolio-label">{vault.safe ? 'BASE SEPOLIA BALANCE' : 'TOTAL DEMO BALANCE'} <span>✳</span></div>
   <div className="tj-portfolio-amount">{vault.safe ? (live?.balanceEth ?? '—') : '0.00'} <span>ETH</span></div>
   <p>{vault.safe ? (balanceError || 'Native ETH balance on Base Sepolia') : 'Placeholder balance · simulated transactions'}</p>
   <div className="tj-portfolio-actions">{vault.safe ? <><a href={`https://app.safe.global/home?safe=basesep:${vault.safe.address}`} target="_blank" rel="noreferrer"><ArrowUpRight size={16} /> Send transaction</a><a href={`https://app.safe.global/transactions/queue?safe=basesep:${vault.safe.address}`} target="_blank" rel="noreferrer"><Radio size={16} /> Open Safe queue</a></>
    : <><button onClick={() => { setError(''); setModal('send'); }}><ArrowUpRight size={16} /> Send transaction</button><button onClick={() => { setError(''); setModal('receive'); void listen(); }}><Radio size={16} /> Listen for transaction</button></>}</div></div>
   <div className="tj-portfolio-art"><div className="tj-portfolio-orbit"><Wallet size={45} strokeWidth={1.2} /></div></div><div className="tj-portfolio-note">{vault.safe ? 'BASE SEPOLIA' : 'DEMO BALANCE'}</div></div>
  <div className="tj-balance-note">{vault.safe ? 'Transactions and signatures for this Safe are handled in the Safe app. Acoustic checks below are separate from Safe transactions and signatures.' : 'This group has no deployed Safe. Its balance and legacy demo transactions are placeholders.'}</div>
  {vault.safe && <div className="tj-balance-note"><button className="tj-light-btn" disabled={anonBusy} onClick={() => void checkAnonymous(vault.safe!.address)}>Check balance via Anon RPC</button> <span>{anon || 'Optional Nym network check. Bootstrap is direct; sign-in and wallet traffic are not protected.'}</span></div>}
  <div className="tj-vault-address"><div><span>VAULT ADDRESS</span><strong>{address || 'Not available yet'}</strong><small>{address ? 'Verified Safe address on Base Sepolia.' : 'A fund-holding wallet address has not been created.'}</small></div><button className="tj-light-btn" disabled={!address} onClick={() => address && void copy(address)}><Copy size={15} /> Copy address</button></div>
  <PhoneAccess />
  <section className="tj-vault-members"><div className="tj-section-heading"><div><div className="tj-section-kicker">THE PEOPLE IN THIS VAULT</div><h2>{vault.safe ? 'Signers' : 'Members'} <span>{vault.safe ? (live?.owners.length ?? '—') : vault.members.length}</span></h2></div></div>
   <div className="tj-member-list">{vault.safe ? (live ? live.owners.map((owner, i) => <div className="tj-member-row" key={owner}><span className={'tj-mini-avatar tj-color' + i % 3}><Wallet size={15} /></span><span><strong>Signer {i + 1}</strong><small>{owner}</small></span></div>) : <div className="tj-member-row"><span>{balanceError || 'Loading current signers…'}</span></div>)
    : vault.members.map((member, i) => <div className="tj-member-row" key={member.id}><span className={'tj-mini-avatar tj-color' + i % 3}>{member.name[0]?.toUpperCase()}</span><span><strong>{member.name}</strong><small>{member.address || 'Legacy identifier (no address)'}</small></span>{member.id === identityId && <span className="tj-member-you">YOU</span>}</div>)}</div></section>
  <section className="tj-activity"><div className="tj-section-heading"><div><div className="tj-section-kicker">KEEPING YOU IN THE LOOP</div><h2>Vault activity</h2>{vault.safe && <p className="tj-form-hint">On-chain transactions are available in the Safe app.</p>}</div></div>
   {transactions.length === 0 ? <div className="tj-empty-activity"><div className="tj-empty-icon"><AudioLines size={22} /></div><div><strong>All quiet here for now.</strong><p>Requests for this vault will appear here.</p></div></div>
    : <div className="tj-tx-list">{transactions.map(item => <button className="tj-tx-row" key={item.id} onClick={() => { setMatched(false); setSelected(item); setModal('details'); }}><div className="tj-tx-icon"><ArrowUpRight size={19} /></div><div className="tj-tx-info"><strong>To {short(item.recipient)}</strong><small>{item.sender_name} · {item.approvals.length}/{vault.requiredApprovals} approvals</small></div><div className="tj-tx-amount"><strong>{item.amount} {item.asset}</strong><small className={item.status === 'completed' ? 'tj-success' : 'tj-pending'}>{item.status === 'completed' ? 'Completed (simulated)' : 'Awaiting approval'}</small></div><ArrowRight size={16} /></button>)}</div>}</section>
  {modal === 'send' && <Modal label="Send a transaction" onClose={close}><div className="tj-modal-icon"><ArrowUpRight /></div><div className="tj-section-kicker">MAKE A MOVE, TOGETHER</div><h2>Send a transaction</h2><p className="tj-modal-desc">Start a simulated request for your vault members to review and approve.</p>
   <label>Recipient<input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Wallet address or demo recipient" /></label>
   <div className="tj-form-row"><label>Amount<input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label><label>Asset<select value={asset} onChange={e => setAsset(e.target.value)}><option>ETH</option><option>USDC</option></select></label></div>
   <label>Note <span className="tj-optional">optional</span><input value={note} onChange={e => setNote(e.target.value)} placeholder="What is this for?" /></label>
   <div className="tj-signal-banner"><Radio size={20} /><div><strong>Sending on your vault’s signal</strong><small>Signal transmission is simulated in this demo.</small></div></div>
   <button className="tj-submit" disabled={busy} onClick={async () => { if (await mutate('transactions', { groupId: vault.id, senderId: identityId, recipient, amount, asset, note }, 'Transaction request created. Your approval was counted.')) { close(); setRecipient(''); setAmount(''); setNote(''); } }}>Send request <ArrowRight size={17} /></button></Modal>}
  {modal === 'receive' && <Modal label="Listen for a transaction" onClose={close}><div className="tj-modal-icon"><Radio /></div><div className="tj-section-kicker">YOUR VAULT SIGNAL</div><h2>Listen for a transaction</h2><p className="tj-modal-desc">Check {vault.name} for simulated transaction requests.</p>
   <div className="tj-dial-wrap"><div className="tj-dial"><div className="tj-dial-inner"><Radio size={27} /><strong className="tj-dial-listening">{matched ? 'Listening' : 'Ready'}</strong><small>VAULT SIGNAL</small></div></div></div>
   <div className="tj-signal-banner"><AudioLines size={20} /><div><strong>Listening on your vault’s signal</strong><small>Microphone listening and signal matching are simulated. No microphone is used.</small></div></div>
   {matched && <div className="tj-match-result">{matching.length ? matching.map(item => <button key={item.id} onClick={() => { setSelected(item); setModal('details'); }}><span><strong>Transaction found</strong><small>{item.amount} {item.asset} to {short(item.recipient)}</small></span><ArrowRight size={17} /></button>) : <p>No pending requests available for this identity.</p>}</div>}
   <button className="tj-submit" disabled={busy} onClick={() => void listen()}>{matched ? 'Check again' : 'Listen for requests'} <ArrowRight size={17} /></button></Modal>}
  {modal === 'details' && t && <Modal label="Transaction details" onClose={close}><div className="tj-modal-icon"><ArrowUpRight /></div><div className="tj-section-kicker">TRANSACTION REQUEST</div><h2>{t.amount} {t.asset}</h2><p className="tj-modal-desc">Review the details before making a decision.</p>
   <div className="tj-details"><div><span>Vault</span><strong>{t.group_name}</strong></div><div><span>From</span><strong>{t.sender_name}</strong></div><div><span>To</span><strong>{t.recipient}</strong></div><div><span>Note</span><strong>{t.note || '—'}</strong></div><div><span>Status</span><strong>{t.status === 'completed' ? 'Completed (simulated)' : 'Awaiting approval'}</strong></div><div><span>Approvals</span><strong>{t.approvals.length} of {t.requiredApprovals} needed</strong></div></div>
   <div className="tj-approval-people">Approved by {t.approvals.map(a => a.name).join(', ')}</div>
   {t.canApprove && <><div className="tj-signal-banner"><Radio size={20} /><div><strong>Approval follows a simulated signal match</strong><small>Receive the request to review and approve it.</small></div></div>
    {matched ? <button className="tj-submit" disabled={busy} onClick={async () => { if (await mutate('approve', { transactionId: t.id, walletId: identityId }, 'Approval recorded.')) close(); }}>Approve transaction <Check size={17} /></button>
     : <button className="tj-submit" onClick={() => { setModal('receive'); void listen(); }}>Listen for transaction <Radio size={17} /></button>}</>}</Modal>}
 </>;
}
