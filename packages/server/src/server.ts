import { handle } from './handler.ts';
import { runInContext, type ServerContext, type StorageAdapter, type TijoriEvent, type TijoriProviders } from './context.ts';
import { toSettings, type TijoriServerConfig } from './config.ts';
import { arkivStorage, localFileStorage, storageFromSettings } from './storage/index.ts';
import { defaultProviders } from './providers.ts';
import { invoiceReceipt } from './services/treasury.ts';

export type TijoriServer = {
 /** Handle a Fetch API request. `waitUntil` overrides config.waitUntil for this request. */
 fetch(request: Request, options?: { waitUntil?: (work: Promise<unknown>) => void }): Promise<Response>;
 /** Run server-side code (e.g. in a React Server Component) with this server's configuration. */
 run<T>(work: () => Promise<T>): Promise<T>;
 /** Public, verifiable invoice receipt (null when unknown). */
 invoiceReceipt(id: string): ReturnType<typeof invoiceReceipt>;
 /** Wait for background work (webhooks) to finish, e.g. before process exit. */
 drain(): Promise<void>;
 readonly basePath: string;
};

/**
 * Create a self-hosted Tijori backend. Validation is lazy: missing settings surface as 501/503 responses for the
 * features that need them, so the server can be constructed during builds.
 */
export function createTijoriServer(config: TijoriServerConfig = {}): TijoriServer {
 const settings = Object.freeze(toSettings(config));
 const basePath = config.basePath ?? '/api';
 const pending = new Set<Promise<unknown>>();
 let storage: StorageAdapter | undefined;
 const resolveStorage = (): StorageAdapter => storage ??= typeof config.storage === 'object' ? config.storage : config.storage === 'local' ? localFileStorage(settings.LOCAL_DEMO_DATA_DIR) : config.storage === 'arkiv' ? arkivStorage() : storageFromSettings();
 const providers: TijoriProviders = { ...defaultProviders, ...(config.providers ?? {}) };
 const track = (work: Promise<unknown>) => { const p = work.catch(error => console.error('[tijori] background task failed', error)).finally(() => pending.delete(p)); pending.add(p); return p; };
 const contextFor = (waitUntil?: (work: Promise<unknown>) => void): ServerContext => ({
  settings,
  storage: resolveStorage,
  providers: () => providers,
  waitUntil: work => { const tracked = track(work); (waitUntil ?? config.waitUntil)?.(tracked); },
  emit: (event: TijoriEvent) => { if (config.onEvent) void track(Promise.resolve().then(() => config.onEvent!(event))); },
 });
 return {
  basePath,
  fetch: (request, options) => runInContext(contextFor(options?.waitUntil), () => handle(request, basePath)),
  run: work => runInContext(contextFor(), work),
  invoiceReceipt: id => runInContext(contextFor(), () => invoiceReceipt(id)),
  drain: async () => { while (pending.size) await Promise.allSettled([...pending]); },
 };
}
