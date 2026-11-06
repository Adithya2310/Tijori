'use client';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Smartphone } from 'lucide-react';

type NetworkInfo = {enabled:boolean;laptopUrl:string;urls:{name:string;url:string}[]};
export default function PhoneAccess() {
 const [network,setNetwork]=useState<NetworkInfo|null>(null),[selected,setSelected]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/network-info',{cache:'no-store',signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error('Could not load phone connection links.');
   const result:NetworkInfo=await response.json();setNetwork(result);
   // When opened on a phone/LAN address, share that same reachable server.
   const current=result.urls.find(item=>new URL(item.url).hostname===window.location.hostname);
   setSelected(current?.url || result.urls[0]?.url || '');
  }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not load phone links.');});
  return ()=>controller.abort();
 },[]);
 async function copy() {
  try{await navigator.clipboard.writeText(selected);setNotice('Phone link copied.');}
  catch{setNotice('Copy the link shown above using your browser.');}
 }
 return <aside className="phone-access" aria-label="Phone connection">
  <div className="phone-access-body"><div className="section-kicker"><Smartphone size={15}/> TRY IT ON ANOTHER DEVICE</div><h3>Open Tichori on your phone</h3>
   {!network&&!error&&<p>Loading local connection links…</p>}
   {error&&<p role="alert">{error} Start the local phone server with <code>npm run dev:phone</code>.</p>}
   {network&&!network.enabled&&<><p>Run <code>npm run dev:phone</code> on this laptop, then open <a href={network.laptopUrl}>{network.laptopUrl}</a> for the phone QR code.</p><p>Keep both devices on the same Wi-Fi or hotspot. The phone server uses the same encrypted Arkiv groups and identities.</p></>}
   {network?.enabled&&<>
    {selected?<><p>Scan the QR code or open this link on your phone. Keep this laptop and phone on the same Wi-Fi or hotspot.</p>
     {network.urls.length>1&&<label className="phone-network">Laptop network<select aria-label="Laptop network" value={selected} onChange={e=>{setSelected(e.target.value);setNotice('');}}>{network.urls.map(item=><option key={item.url} value={item.url}>{item.name} · {new URL(item.url).hostname}</option>)}</select></label>}
     <div className="phone-link"><a href={selected}>{selected}</a><button type="button" onClick={()=>void copy()} aria-label="Copy phone link"><Copy size={15}/></button></div>
     <p>If one network link does not open, try the other, or connect both devices to a phone hotspot and restart the server. Handle the local certificate warning in your browser.</p></>:<p>No local network address found. Connect this laptop to Wi-Fi or a phone hotspot, then restart <code>npm run dev:phone</code>.</p>}
    <ol><li>Create a different demo identity on each device and copy its generated public address.</li><li>Choose Create acoustic group and invite the other identity addresses. Each member opens that group in My vaults (refresh the list if needed).</li><li>One device taps Send. Other members tap Join check and allow their microphone. You can swap roles in a new check.</li></ol>
   </>}
   {notice&&<p role="status">{notice}</p>}
  </div>
  {network?.enabled&&selected&&<div className="phone-qr"><QRCodeSVG value={selected} size={144} marginSize={4} title="Scan to open this local Tichori server"/><small>Same app · same group check</small></div>}
 </aside>;
}
