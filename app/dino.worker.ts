// Keep bootstrap small so runtime import failures can be reported to the page.
let running = false;
self.onmessage = async (event: MessageEvent<{ image: Blob; point?: {x:number;y:number}; box?: {x1:number;y1:number;x2:number;y2:number}; preprocessVersion?:1|2 }>) => {
 if (running) return;
 running = true;
 try {
  self.postMessage({ status: 'progress', message: 'Starting local image runtime…' });
  const { extractObjectFeatures } = await import('../lib/dino-inference');
  const features = await extractObjectFeatures(event.data.image, message => self.postMessage({ status: 'progress', message }),()=>false,event.data.point,event.data.preprocessVersion??2,event.data.box);
  self.postMessage({ status: 'complete', features });
 } catch (error) {
  self.postMessage({ status: 'error', message: error instanceof Error ? error.message.slice(0, 400) : 'The local image runtime failed.' });
 } finally { running = false; }
};
