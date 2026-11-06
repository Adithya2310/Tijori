// Module worker for on-device DINOv2 and SlimSAM. Keep the bootstrap small so runtime import failures reach the page.
// The worker stays alive between jobs, so the models load once per page: jobs queue and run one at a time. Every
// reply carries the job's id; a cancelled job stops at its next step and its reply is ignored by the page.
type Job = {
 id?: number;
 mode?: 'features' | 'descriptor' | 'preload' | 'cancel';
 image?: Blob;
 point?: { x: number; y: number };
 assetBaseUrl?: string;
 brush?: import('./object-geometry.ts').ObjectBrush;
 accelerator?: import('./on-device-runtime.ts').ObjectAccelerator;
};
const queue: Job[] = [], cancelled = new Set<number>();
let busy = false, current: number | undefined;
async function run(job: Job) {
 current = job.id;
 const post = (message: Record<string, unknown>) => self.postMessage({ id: job.id, ...message });
 const isCancelled = () => job.id !== undefined && cancelled.has(job.id);
 try {
  if (isCancelled()) throw Error('Image processing cancelled.');
  post({ status: 'progress', message: 'Starting local image runtime…' });
  const inference = await import('./dino-inference.ts');
  const progress = (message: string) => { if (!isCancelled()) post({ status: 'progress', message }); };
  if (job.mode === 'preload') {
   post({ status: 'complete', runtime: await inference.loadObjectModels(progress, job.assetBaseUrl, job.accelerator) });
  } else if (job.mode === 'descriptor') {
   post({ status: 'complete', result: await inference.runObjectDescriptor(job.image!, progress, isCancelled, job.point, job.assetBaseUrl, job.brush, job.accelerator) });
  } else {
   post({ status: 'complete', features: await inference.runDinoInference(job.image!, progress, isCancelled, job.point, job.assetBaseUrl) });
  }
 } catch (error) {
  post({ status: 'error', message: error instanceof Error ? error.message.slice(0, 400) : 'The local image runtime failed.' });
 } finally { current = undefined; if (job.id !== undefined) cancelled.delete(job.id); }
}
self.onmessage = async (event: MessageEvent<Job>) => {
 const job = event.data;
 if (job.mode === 'cancel') { if (job.id !== undefined && (job.id === current || queue.some(queued => queued.id === job.id))) cancelled.add(job.id); return; }
 queue.push(job);
 if (busy) return;
 busy = true;
 try { while (queue.length) await run(queue.shift()!); } finally { busy = false; }
};
export {};
