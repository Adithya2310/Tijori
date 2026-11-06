// Per-request server context. createTijoriServer() runs every request inside this context so library
// modules read their settings, storage and providers from the server instance instead of process.env.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { IntegrationProviders, PresenceSessionProvider } from '@tijori/core/integrations';
import type { StateStore } from '@tijori/core/state-store';

export type Settings = Readonly<Record<string, string | undefined>>;
/** Pluggable persistence for the encrypted vault aggregate. `transact` must serialize writers. */
export type StorageAdapter = { readonly mode: string; transact<T>(work: (store: StateStore) => Promise<T>): Promise<T> };
export type TijoriProviders = IntegrationProviders & { presence: PresenceSessionProvider };
/** Domain events for integrators (webhooks, analytics, notifications). Delivered best-effort, after the write. */
export type TijoriEvent =
 | { type: 'vault.created'; vaultId: string; safe: string; chainId: number }
 | { type: 'proposal.executed'; proposalId: string; vaultId: string; txHash: string; success: boolean }
 | { type: 'invoice.paid'; invoiceId: string; vaultId: string; txHash: string };
export type ServerContext = {
 settings: Settings;
 storage: () => StorageAdapter;
 providers: () => TijoriProviders;
 waitUntil: (work: Promise<unknown>) => void;
 emit: (event: TijoriEvent) => void;
};

const als = new AsyncLocalStorage<ServerContext>();
export const runInContext = <T>(context: ServerContext, work: () => T): T => als.run(context, work);
export const currentContext = (): ServerContext | undefined => als.getStore();

const warned = new Set<string>();
/** Read a setting. New TIJORI_* names fall back to the legacy TICHORI_* names (warning once each). */
export function setting(name: string): string | undefined {
 const source: Settings = als.getStore()?.settings ?? process.env;
 const value = source[name];
 if (value !== undefined || !name.startsWith('TIJORI_')) return value;
 const legacyName = 'TICHORI_' + name.slice('TIJORI_'.length), legacy = source[legacyName];
 if (legacy !== undefined && !warned.has(legacyName)) { warned.add(legacyName); console.warn(`[tijori] ${legacyName} is deprecated; rename it to ${name}.`); }
 return legacy;
}
let fallbackStorage: (() => StorageAdapter) | undefined;
let fallbackProviders: (() => TijoriProviders) | undefined;
/** Wired by storage/index.ts and providers.ts so modules can be used outside a server (scripts, tests). */
export function registerDefaults(defaults: { storage?: () => StorageAdapter; providers?: () => TijoriProviders }) {
 fallbackStorage = defaults.storage ?? fallbackStorage; fallbackProviders = defaults.providers ?? fallbackProviders;
}
export const currentStorage = (): StorageAdapter => (als.getStore()?.storage ?? fallbackStorage!)();
export const currentProviders = (): TijoriProviders => (als.getStore()?.providers ?? fallbackProviders!)();
/** Schedule background work (webhooks) without blocking the response. */
export function waitUntil(work: Promise<unknown>) {
 const context = als.getStore();
 if (context) context.waitUntil(work); else void work.catch(() => undefined);
}
export const emit = (event: TijoriEvent) => als.getStore()?.emit(event);
