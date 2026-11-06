'use client';
import { useState } from 'react';
import { getAddress, isAddress } from 'viem';
import { ArrowRight, Plus, Radio, Users, X } from 'lucide-react';
import { useTijori } from '../context.tsx';

const VAULT_OPERATION_KEY = 'pv-vault-op';
const short = (s: string) => (s.length > 24 ? `${s.slice(0, 12)}…${s.slice(-7)}` : s);

function useMembers() {
 const { setError } = useTijori();
 const [members, setMembers] = useState<string[]>([]), [input, setInput] = useState('');
 const has = (address: string) => members.some(item => item.toLowerCase() === address.toLowerCase());
 function add(value = input.trim()) {
  if (!value) return;
  if (!isAddress(value)) { setError('Enter a valid EVM wallet address.'); return; }
  const address = getAddress(value);
  if (has(address)) { setError('This signer has already been added.'); return; }
  setMembers(list => [...list, address]); setInput(''); setError('');
 }
 const entry = (label: string) => <>
  <div className="tj-member-entry"><input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="0x…" aria-label={label} /><button onClick={() => add()} type="button"><Plus size={16} /> Add</button></div>
 </>;
 const chips = (full = false) => <div className="tj-member-chips">{members.map(id => <span key={id}>{full ? id : short(id)}<button aria-label={`Remove ${id}`} onClick={() => setMembers(members.filter(m => m !== id))}><X size={14} /></button></span>)}</div>;
 return { members, has, add, entry, chips };
}

/**
 * Create a Whitechain vault: the server's relayer deploys a Safe with the presence guard, gaslessly.
 * A majority of signers must later approve each payout together, in one session.
 */
export function CreateVault({ onCreated, name: brand = 'Tijori' }: { onCreated?: (vaultId: string) => void; name?: string }) {
 const { client, identityId, busy, run, setData, setNotice, setError } = useTijori();
 const [name, setName] = useState('');
 const { members, entry, chips } = useMembers();
 async function create() {
  if (!name.trim() || name.trim().length > 120 || !members.length || members.length > 31) { setError('Enter a vault name of at most 120 characters and 1–31 other signer addresses.'); return; }
  await run(async () => {
   // Reuse the operation ID for an identical retry so the relayer never deploys twice.
   let op = sessionStorage.getItem(VAULT_OPERATION_KEY); const fingerprint = JSON.stringify([name.trim(), members]);
   if (!op || !op.startsWith(fingerprint + '|')) { op = fingerprint + '|' + crypto.randomUUID(); sessionStorage.setItem(VAULT_OPERATION_KEY, op); }
   const result = await client.createWhitechainVault(name.trim(), identityId, members, op.split('|').pop()!);
   sessionStorage.removeItem(VAULT_OPERATION_KEY); setData(result); setNotice('Whitechain vault created. The presence guard is active.');
   onCreated?.(result.vaultId ?? '');
  });
 }
 const required = Math.floor((members.length + 1) / 2) + 1;
 return <><div className="tj-modal-icon"><Users /></div><div className="tj-section-kicker">BETTER TOGETHER</div><h2>Create a vault</h2>
  <p className="tj-modal-desc">{brand} deploys a Safe treasury on Whitechain for you. No wallet or gas needed. Payouts need a majority of signers approving together, in the same room.</p>
  <label>Vault name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. The family vault" /></label>
  <label>Other signers ({brand} addresses)</label>{entry('Signer wallet address')}
  <p className="tj-form-hint">Your {brand} address is included automatically. Add each other signer&apos;s {brand} address.</p>{chips(true)}
  <div className="tj-signal-banner"><Radio size={20} /><div><strong>Whitechain Sepolia · {required} of {members.length + 1} must approve together</strong><small>{brand}&apos;s relayer deploys the presence-guarded Safe for you. No wallet or gas needed.</small></div></div>
  <button className="tj-submit" disabled={busy} onClick={() => void create()}>Create vault <ArrowRight size={17} /></button></>;
}

/** Create a group for acoustic attendance checks only (no Safe), from enrolled peers or pasted addresses. */
export function CreateAcousticGroup({ onCreated }: { onCreated?: () => void }) {
 const { data, identityId, busy, mutate, localStorageMode } = useTijori();
 const [name, setName] = useState('');
 const { members, has, add, entry, chips } = useMembers();
 const peers = (data.peers || []).filter(peer => peer.id !== identityId);
 return <><div className="tj-modal-icon"><Radio /></div><div className="tj-section-kicker">GET TOGETHER</div><h2>Create an acoustic group</h2>
  <p className="tj-modal-desc">{localStorageMode ? 'Choose another enrolled user below. This group is saved on the laptop; it does not deploy a Safe.' : 'Choose another enrolled user below. This group is saved in Arkiv without deploying a Safe.'}</p>
  <label>Group name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acoustic test group" /></label>
  <div className="tj-discovered-peers"><strong>Registered people</strong><p className="tj-form-hint">New users appear automatically. Each device needs its own identity.</p>
   {peers.map(peer => <button type="button" className="tj-peer-option" disabled={busy || (!!peer.address && has(peer.address))} key={peer.id} onClick={() => peer.address && add(peer.address)}><span><strong>{peer.name}</strong><small>{peer.address}</small></span><span>{peer.address && has(peer.address) ? 'Added' : '+ Add'}</span></button>)}
   {!peers.length && <p className="tj-form-hint">Waiting for another device to create a user…</p>}</div>
  <label>Member identity address</label>{entry('Member identity address')}
  <p className="tj-form-hint">Your identity is included automatically. Invite at least one other enrolled identity.</p>{chips()}
  <button className="tj-submit" disabled={busy || !name.trim() || !members.length} onClick={async () => { if (await mutate('groups', { name, creatorId: identityId, addresses: members }, 'Acoustic group created. Open it to start a check.')) onCreated?.(); }}>Create acoustic group <ArrowRight size={17} /></button></>;
}
