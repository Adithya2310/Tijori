// Module worker for on-device DINOv2. Keep the bootstrap small so runtime import failures reach the page.
type Job = { image: Blob; point?: { x: number; y: number }; assetBaseUrl?: string };
let running = false;
self.onmessage = async (event: MessageEvent<Job>) => {
 if (running) return;
 running = true;
 try {
  self.postMessage({ status: 'progress', message: 'Starting local image runtime…' });
  const { runDinoInference } = await import('./dino-inference.ts');
  const features = await runDinoInference(event.data.image, message => self.postMessage({ status: 'progress', message }), () => false, event.data.point, event.data.assetBaseUrl);
  self.postMessage({ status: 'complete', features });
 } catch (error) {
  self.postMessage({ status: 'error', message: error instanceof Error ? error.message.slice(0, 400) : 'The local image runtime failed.' });
 } finally { running = false; }
};
export {};
