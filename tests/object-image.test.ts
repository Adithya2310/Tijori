import test from 'node:test';
import assert from 'node:assert/strict';
import { squareCrop, renderObjectCrop, selectedMaskIndex } from '../lib/object-image.ts';

test('square padding preserves a thin object aspect ratio instead of stretching it',()=>{
 const layout=squareCrop(20,100);
 assert.equal(layout.side,108);assert.equal(layout.x,44);assert.equal(layout.y,4);
 const width=20,height=100,pixels=new Uint8ClampedArray(width*height*4),mask=new Uint8Array(width*height).fill(1);
 for(let i=0;i<width*height;i++)pixels[i*4+3]=255;
 const prepared=renderObjectCrop(pixels,mask,width,height,[0,0,width,height],2);
 assert.equal(prepared.width,224);assert.equal(prepared.height,224);
 let minX=224,maxX=0,minY=224,maxY=0;
 for(let y=0;y<224;y++)for(let x=0;x<224;x++)if(prepared.data[(y*224+x)*3]<100){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 assert.ok(Math.abs((maxX-minX+1)/(maxY-minY+1)-0.2)<0.02);
 assert.ok(prepared.foreground.some(n=>n===0),'padding must not count as foreground evidence');
 assert.deepEqual(renderObjectCrop(pixels,mask,width,height,[0,0,width,height],2),prepared,'same pixels produce the exact same tensor input');
});

test('legacy crop mapping remains unchanged; malformed mappings fail closed',()=>{
 const pixels=new Uint8ClampedArray([10,20,30,255,40,50,60,255,70,80,90,255,100,110,120,255]);
 const mask=new Uint8Array([1,1,1,1]);
 assert.deepEqual(Array.from(renderObjectCrop(pixels,mask,2,2,[1,0,1,2],1).data),[40,50,60,100,110,120]);
 assert.throws(()=>renderObjectCrop(pixels,mask,2,2,[1,0,5,2],2),/Invalid/);
 assert.throws(()=>squareCrop(0,1),/Invalid/);
});

test('non-RGBA source buffers are refused rather than silently read with the wrong stride',()=>{
 assert.throws(()=>renderObjectCrop(new Uint8ClampedArray(2*2*3),new Uint8Array(4),2,2,[0,0,2,2],2),/Invalid crop mapping/);
});

test('selected mask must contain the explicit tap, even when another mask has a higher score',()=>{
 const masks=new Uint8Array([0,0,0,0, 0,0,0,1, 1,1,1,1]);
 assert.equal(selectedMaskIndex([0.99,0.95,0.8],masks,2,2,{x:0.75,y:0.75}),1);
 assert.throws(()=>selectedMaskIndex([0.99],new Uint8Array(4),2,2,{x:0.75,y:0.75}),/No object found/);
});
