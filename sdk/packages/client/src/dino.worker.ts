// Module worker for on-device DINOv2. Keep the bootstrap small so runtime import failures reach the page.
// Jobs run one at a time; a worker may process several (a sign-up scan reuses the loaded models).
type Job = { image: Blob; point?: { x: number; y: number }; assetBaseUrl?: string; mode?: 'features' | 'descriptor' };
let running = false;
self.onmessage = async (event: MessageEvent<Job>) => {
 if (running) return;
 running = true;
 try {
  self.postMessage({ status: 'progress', message: 'Starting local image runtime…' });
  const inference = await import('./dino-inference.ts');
  const progress = (message: string) => self.postMessage({ status: 'progress', message });
  if (event.data.mode === 'descriptor') {
   const result = await inference.runObjectDescriptor(event.data.image, progress, () => false, event.data.point, event.data.assetBaseUrl);
   self.postMessage({ status: 'complete', result });
  } else {
   const features = await inference.runDinoInference(event.data.image, progress, () => false, event.data.point, event.data.assetBaseUrl);
   self.postMessage({ status: 'complete', features });
  }
 } catch (error) {
  self.postMessage({ status: 'error', message: error instanceof Error ? error.message.slice(0, 400) : 'The local image runtime failed.' });
 } finally { running = false; }
};
export {};
