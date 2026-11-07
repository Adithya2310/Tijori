'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, LockKeyhole, LogOut, Plus, ShieldCheck, Users, Wallet, X } from 'lucide-react';
import type { ApiVault } from '@tijori/client';
import { useTijori } from '../context.tsx';
import { TijoriAuth, type AuthAlternative } from './TijoriAuth.tsx';
import { VaultList } from './VaultList.tsx';
import { CreateAcousticGroup, CreateVault } from './CreateVault.tsx';
import { Modal } from './Modal.tsx';
import ProximityCheck from './ProximityCheck.tsx';
import { VaultTreasury } from './VaultTreasury.tsx';

export type TijoriAppProps = {
 /** Product name shown in the UI. Default 'Tijori'. */
 name?: string;
 /** Another sign-in path in the login tab (e.g. legacy passphrase identities). */
 authAlternative?: AuthAlternative;
 authFooter?: ReactNode;
 /**
  * Render vaults that are not Whitechain treasuries (legacy or acoustic-only groups). Without it, and unless
  * createMode is 'acoustic-group', only Whitechain vaults are listed (other stored groups stay untouched).
  */
 renderVault?: (vault: ApiVault) => ReactNode;
 /** Content after the vault list, e.g. setup instructions. */
 dashboardExtras?: ReactNode;
 /** Content at the end of every vault view. */
 vaultExtras?: (vault: ApiVault) => ReactNode;
 footer?: ReactNode;
 /** The dashboard's create action. Default 'vault'. 'acoustic-group' restores the older standalone acoustic groups. */
 createMode?: 'vault' | 'acoustic-group';
 loading?: ReactNode;
};

/** Members of a group without a Whitechain treasury. */
export function GroupMembers({ vault }: { vault: ApiVault }) {
 return <section className="tj-vault-members"><div className="tj-section-heading"><div><div className="tj-section-kicker">THE PEOPLE IN THIS VAULT</div><h2>Members <span>{vault.members.length}</span></h2></div></div>
  <div className="tj-member-list">{vault.members.map((member, i) => <div className="tj-member-row" key={member.id}><span className={'tj-mini-avatar tj-color' + i % 3}><Users size={15} /></span><span><strong>{member.name}</strong><small>{member.address ?? 'Legacy identity'}</small></span></div>)}</div></section>;
}

/** Acoustic proof of attendance for one vault, with the standard explanation. */
export function AttendanceCheck({ vault }: { vault: ApiVault }) {
 const { identityId, localStorageMode, data } = useTijori();
 return <section className="tj-acoustic-section"><div className="tj-section-heading"><div><div className="tj-section-kicker">GET TOGETHER</div><h2>Acoustic proximity check</h2></div></div>
  <p className="tj-form-hint">Send broadcasts a two-minute challenge. Other enrolled vault members join from their devices. Matches are saved in {localStorageMode ? 'the laptop’s encrypted local database' : 'encrypted Arkiv state'} and never authorize a transfer.</p>
  <ProximityCheck key={`${vault.id}:${identityId}`} group={vault} walletId={identityId} storageMode={data.storageMode} /></section>;
}

/**
 * The complete Tijori experience: object sign-in, then Whitechain vaults whose payouts run once every member is
 * together (their devices hear a payment code and their own keys sign).
 */
export function TijoriApp({ name = 'Tijori', authAlternative, authFooter, renderVault, dashboardExtras, vaultExtras, footer, createMode, loading }: TijoriAppProps) {
 const { client, loaded, identity, data, localStorageMode, notice, error, setNotice, setError, refresh, busy, pausePolling, signOut } = useTijori();
 const [vaultId, setVaultId] = useState(''), [modal, setModal] = useState<'vault' | 'acoustic-group' | null>(null), [whitechainReady, setWhitechainReady] = useState<boolean | null>(null);
 useEffect(() => {
  let live = true;
  client.capabilities().then(result => { if (live) setWhitechainReady((result.whitechain as { configured?: boolean } | undefined)?.configured === true); }, () => { if (live) setWhitechainReady(null); });
  return () => { live = false; };
 }, [client]);
 // The vault view polls its own sessions; background state polling resumes on the dashboard.
 useEffect(() => (vaultId ? pausePolling() : undefined), [vaultId, pausePolling]);
 if (!loaded) return <>{loading ?? <div className="tj-loading">Loading your vault…</div>}</>;
 if (!identity) return <TijoriAuth name={name} alternative={authAlternative} footer={authFooter} />;
 const create = createMode ?? 'vault', legacyGroups = create === 'acoustic-group' || !!renderVault;
 const createLabel = create === 'vault' ? 'Create vault' : 'Create acoustic group';
 const canCreate = create !== 'vault' || whitechainReady !== false;
 const vault = data.groups.find(g => g.id === vaultId);
 const showVaults = () => { setVaultId(''); setError(''); setNotice(''); if (!busy) void refresh(); };
 const showVault = (id: string) => { setVaultId(id); setError(''); setNotice(''); if (!busy) void refresh(); };
 const open = (next: 'vault' | 'acoustic-group') => { setError(''); setNotice(''); setModal(next); };
 const close = () => { setModal(null); setError(''); };
 const whitechain = vault?.safe?.chainId === 1874;
 const summary = !vault ? '' : whitechain ? (vault.requiredApprovals >= vault.members.length ? `${vault.members.length} members · all must be together to pay` : `${vault.members.length} members · ${vault.requiredApprovals} must be together to pay`)
  : vault.safe ? `${vault.safe.owners.length} signers · ${vault.requiredApprovals} approvals needed` : `${vault.members.length} members · ${vault.requiredApprovals} approvals needed`;
 return <div className="tj-shell"><aside className="tj-sidebar"><div className="tj-brand"><div className="tj-brand-mark"><LockKeyhole size={18} /></div><span>{name}<span className="tj-brand-dot">.</span></span></div>
  <div className="tj-side-label">WORKSPACE</div><nav><button className="tj-nav tj-active" onClick={showVaults}><Wallet size={18} /><span>My vaults</span></button></nav>
  <div className="tj-side-bottom"><div className="tj-side-card"><div className="tj-side-card-icon"><ShieldCheck size={18} /></div><strong>Better together.</strong><p>Make decisions with your people.</p></div>
   <div className="tj-side-foot"><span className="tj-avatar tj-small">{identity.name[0]?.toUpperCase()}</span><div><strong>{identity.name}</strong><small>{identity.address || 'Legacy identity'}</small></div></div></div></aside>
  <main className="tj-main"><header className="tj-topbar"><div className="tj-crumb"><button onClick={showVaults}>My vaults</button>{vault && <><span>/</span><strong>{vault.name}</strong></>}</div>
   <div className="tj-top-actions"><span className="tj-demo-pill"><span /> {localStorageMode ? 'LOCAL WI-FI TEST' : 'ARKIV DEMO'}</span><button className="tj-signout" onClick={() => { signOut(); setVaultId(''); }}><LogOut size={16} /> <span>Log out</span></button></div></header>
   <div className="tj-content"><div className="tj-welcome"><div><div className="tj-eyebrow"><span className="tj-sparkle">✳</span> YOUR SHARED SPACE</div>
    {vault ? <><button className="tj-back-link" onClick={showVaults}><ArrowLeft size={14} /> All vaults</button><h1>{vault.name}</h1><p>{summary}</p></> : <><h1>My vaults</h1><p>All the people and vaults you share decisions with.</p></>}</div>
    {!vault && canCreate && <button className="tj-primary" onClick={() => open(create)}><Plus size={17} /> {createLabel}</button>}</div>
    {localStorageMode && <div className="tj-notice">Local Wi-Fi test · Identities and vaults are saved only on this laptop (encrypted). Vault deployments and payouts are real Whitechain testnet transactions.</div>}
    {!canCreate && <div className="tj-error">Whitechain vaults are not configured on this server: set the relayer and verifier keys and the guard addresses (see .env.example).</div>}
    {notice && <div className="tj-notice"><CheckCircle2 size={17} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16} /></button></div>}
    {error && !modal && <div className="tj-error">{error}</div>}
    {!vaultId && <VaultList onOpen={showVault} onCreate={canCreate ? () => open(create) : undefined} createLabel={create === 'vault' ? 'Create your first vault' : createLabel} filter={legacyGroups ? undefined : item => item.safe?.chainId === 1874} />}
    {!vault && dashboardExtras}
    {vaultId && !vault && <div className="tj-empty-groups"><p>This vault is unavailable for the current identity.</p><button className="tj-light-btn" onClick={showVaults}>Back to my vaults</button></div>}
    {vault && create === 'acoustic-group' && !whitechain && <AttendanceCheck vault={vault} />}
    {vault && (whitechain ? <VaultTreasury vaultId={vault.id} /> : renderVault ? renderVault(vault) : <GroupMembers vault={vault} />)}
    {vault && vaultExtras?.(vault)}
    <footer>{footer ?? <><span /><span><ShieldCheck size={15} /> Made for trust, built for together.</span><span>{name.toUpperCase()} &nbsp; © 2026</span></>}</footer></div></main>
  <nav className="tj-mobile-nav" aria-label="Main navigation"><button className="tj-active" onClick={showVaults}><Wallet size={19} /><span>My vaults</span></button></nav>
  {modal && <Modal label={modal === 'vault' ? 'Create a vault' : 'Create an acoustic group'} onClose={close}>
   {modal === 'vault' ? <CreateVault name={name} onCreated={id => { close(); if (id) setVaultId(id); }} /> : <CreateAcousticGroup onCreated={close} />}
  </Modal>}
 </div>;
}
