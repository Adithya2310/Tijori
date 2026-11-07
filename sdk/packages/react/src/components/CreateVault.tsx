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
 const remove = (address: string) => setMembers(list => list.filter(item => item.toLowerCase() !== address.toLowerCase()));
 const chips = (full = false) => <div className="tj-member-chips">{members.map(id => <span key={id}>{full ? id : short(id)}<button aria-label={`Remove ${id}`} onClick={() => setMembers(members.filter(m => m !== id))}><X size={14} /></button></span>)}</div>;
 return { members, has, add, remove, entry, chips };
}

/**
 * Create a Whitechain vault from people registered on this server: the server's relayer deploys a Safe with the
 * presence guard, gaslessly. Every member must later be together for each payout: their devices hear the payment
 * code and their own keys sign.
 */
export function CreateVault({ onCreated, name: brand = 'Tijori' }: { onCreated?: (vaultId: string) => void; name?: string }) {
 const { client, data, identityId, busy, run, setData, setNotice, setError } = useTijori();
 const [name, setName] = useState('');
 const { members, has, add, remove } = useMembers();
 const peers = (data.peers || []).filter(peer => peer.id !== identityId && peer.address);
 const nameOf = (address: string) => peers.find(peer => peer.address?.toLowerCase() === address.toLowerCase())?.name ?? short(address);
 async function create() {
  if (!name.trim() || name.trim().length > 120 || !members.length || members.length > 31) { setError('Enter a vault name of at most 120 characters and add 1–31 other members.'); return; }
  await run(async () => {
   // Reuse the operation ID for an identical retry so the relayer never deploys twice.
   let op = sessionStorage.getItem(VAULT_OPERATION_KEY); const fingerprint = JSON.stringify([name.trim(), members]);
   if (!op || !op.startsWith(fingerprint + '|')) { op = fingerprint + '|' + crypto.randomUUID(); sessionStorage.setItem(VAULT_OPERATION_KEY, op); }
   const result = await client.createWhitechainVault(name.trim(), identityId, members, op.split('|').pop()!);
   sessionStorage.removeItem(VAULT_OPERATION_KEY); setData(result); setNotice('Whitechain vault created. The presence guard is active.');
   onCreated?.(result.vaultId ?? '');
  });
 }
 return <><div className="tj-modal-icon"><Users /></div><div className="tj-section-kicker">BETTER TOGETHER</div><h2>Create a vault</h2>
  <p className="tj-modal-desc">{brand} deploys a Safe treasury on Whitechain for you. No wallet or gas needed. Every payout needs all members together: their devices hear a payment code and their own keys sign.</p>
  <label>Vault name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. The family vault" /></label>
  <div className="tj-discovered-peers"><strong>Registered people</strong><p className="tj-form-hint">Pick the other members. Each person signs up on their own device first; new people appear here automatically. You are included.</p>
   {peers.map(peer => <button type="button" className="tj-peer-option" disabled={busy} aria-pressed={has(peer.address!)} key={peer.id} onClick={() => (has(peer.address!) ? remove(peer.address!) : add(peer.address!))}><span><strong>{peer.name}</strong><small>{peer.address}</small></span><span>{has(peer.address!) ? 'Added ✓' : '+ Add'}</span></button>)}
   {!peers.length && <p className="tj-form-hint">Waiting for another person to sign up on their device…</p>}</div>
  {members.length > 0 && <p className="tj-form-hint">Members: you, {members.map(nameOf).join(', ')}.</p>}
  <div className="tj-signal-banner"><Radio size={20} /><div><strong>Whitechain Sepolia · {members.length ? `all ${members.length + 1} members must be together to pay` : 'every member must be together to pay'}</strong><small>The presence guard on the Safe accepts a payout only with every member&apos;s signature and the payment check.</small></div></div>
  <button className="tj-submit" disabled={busy || !name.trim() || !members.length} onClick={() => void create()}>Create vault <ArrowRight size={17} /></button></>;
}

/** Create a group for acoustic attendance checks only (no Safe), from enrolled peers or pasted addresses. */
export function CreateAcousticGroup({ onCreated }: { onCreated?: () => void }) {
 const { data, identityId, busy, mutate } = useTijori();
 const [name, setName] = useState('');
 const { members, has, add, entry, chips } = useMembers();
 const peers = (data.peers || []).filter(peer => peer.id !== identityId);
 return <><div className="tj-modal-icon"><Radio /></div><div className="tj-section-kicker">GET TOGETHER</div><h2>Create an acoustic group</h2>
  <p className="tj-modal-desc">Choose another enrolled user below. This group does not deploy a Safe.</p>
  <label>Group name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acoustic test group" /></label>
  <div className="tj-discovered-peers"><strong>Registered people</strong><p className="tj-form-hint">New users appear automatically. Each device needs its own identity.</p>
   {peers.map(peer => <button type="button" className="tj-peer-option" disabled={busy || (!!peer.address && has(peer.address))} key={peer.id} onClick={() => peer.address && add(peer.address)}><span><strong>{peer.name}</strong><small>{peer.address}</small></span><span>{peer.address && has(peer.address) ? 'Added' : '+ Add'}</span></button>)}
   {!peers.length && <p className="tj-form-hint">Waiting for another device to create a user…</p>}</div>
  <label>Member identity address</label>{entry('Member identity address')}
  <p className="tj-form-hint">Your identity is included automatically. Invite at least one other enrolled identity.</p>{chips()}
  <button className="tj-submit" disabled={busy || !name.trim() || !members.length} onClick={async () => { if (await mutate('groups', { name, creatorId: identityId, addresses: members }, 'Acoustic group created. Open it to start a check.')) onCreated?.(); }}>Create acoustic group <ArrowRight size={17} /></button></>;
}
