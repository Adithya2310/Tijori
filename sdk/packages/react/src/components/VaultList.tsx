'use client';
import { ArrowRight, Plus, Users, Wallet } from 'lucide-react';
import { SAFE_NETWORKS } from '@tijori/core/whitechain/chain';
import type { ApiVault } from '@tijori/client';
import { useTijori } from '../context.tsx';

/** The signed-in identity's vaults and groups (optionally filtered, e.g. to Whitechain vaults only). */
export function VaultList({ onOpen, onCreate, createLabel, filter }: { onOpen: (vaultId: string) => void; onCreate?: () => void; createLabel?: string; filter?: (vault: ApiVault) => boolean }) {
 const { data, identity, setNotice, setError } = useTijori();
 const groups = filter ? data.groups.filter(filter) : data.groups;
 const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setNotice('Address copied.'); } catch { setError('Could not copy the address.'); } };
 return <section className="tj-vault-list-section"><div className="tj-section-heading"><div><div className="tj-section-kicker">YOUR SHARED VAULTS</div>
  {identity?.address && <p className="tj-form-hint">Your public address: {identity.address} <button onClick={() => void copy(identity.address!)}>Copy</button></p>}
  <h2>Vaults <span>{groups.length}</span></h2></div></div>
  {groups.length === 0 ? <div className="tj-empty-groups"><div className="tj-empty-icon"><Users size={23} /></div><div><strong>Good things happen together.</strong><p>Create a vault and bring your people together.</p></div>
   {onCreate && <button className="tj-light-btn" onClick={onCreate}><Plus size={16} /> {createLabel ?? 'Create your first vault'}</button>}</div>
   : <div className="tj-vault-list">{groups.map((item, i) => <button className="tj-vault-list-item" key={item.id} onClick={() => onOpen(item.id)}><span className={'tj-wallet-icon tj-color' + i % 3}><Wallet size={19} /></span>
    <span className="tj-vault-list-copy"><strong>{item.name}</strong><small>{item.safe ? `${item.safe.owners.length} members · ${item.requiredApprovals >= item.safe.owners.length ? 'all' : item.requiredApprovals} together to pay · ${SAFE_NETWORKS[item.safe.chainId].label}` : `${item.members.length} members · ${item.requiredApprovals} approvals needed`}</small></span>
    <span className="tj-vault-list-action">Open vault <ArrowRight size={16} /></span></button>)}</div>}
 </section>;
}
