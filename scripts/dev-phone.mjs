import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { createServer as createHttpsServer } from 'node:https';
import { lanAddresses } from '../lib/local-network.mjs';

const port = Number(process.env.TIJORI_PHONE_PORT || process.env.TICHORI_PHONE_PORT || 3443);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('TIJORI_PHONE_PORT must be an integer between 1024 and 65535.');
// Fail instead of silently changing the port and invalidating the phone QR code.
await new Promise((resolveReady,reject) => {
 const probe = createServer();probe.once('error',reject);
 probe.listen(port,'0.0.0.0',()=>probe.close(resolveReady));
}).catch(error => {console.error(`Cannot start phone server on port ${port}: ${error.message}`);process.exit(1);});

const addresses = lanAddresses();
// Prepare the pinned on-device model assets (resumable, checksum-verified).
// Uses the CLI shipped in the installed @tijori/client package, like any integrator.
const prepareAssets = fileURLToPath(import.meta.resolve('@tijori/client/cli/prepare-assets'));
if (spawnSync(process.execPath, [prepareAssets, 'public/tijori-assets'], { stdio: 'inherit' }).status !== 0) throw Error('Model asset preparation failed. Run it again to resume.');
const directory = resolve('.local-https');
mkdirSync(directory,{recursive:true,mode:0o700});
const key = resolve(directory,'key.pem'), cert = resolve(directory,'cert.pem');
const hosts = ['localhost','127.0.0.1',...addresses.map(item=>item.address)];
const signature = JSON.stringify(hosts);
const metadata = resolve(directory,'hosts.json');
const existingHosts = existsSync(metadata) ? readFileSync(metadata,'utf8') : '';
const valid = existsSync(cert) && spawnSync('openssl',['x509','-checkend','86400','-noout','-in',cert],{stdio:'ignore'}).status === 0;
if (!existsSync(key) || !valid || existingHosts !== signature) {
 const config = resolve(directory,'openssl.cnf');
 writeFileSync(config,`[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=Tijori local demo\n[ext]\nsubjectAltName=@names\n[names]\nDNS.1=localhost\n${hosts.slice(1).map((host,i)=>`IP.${i+1}=${host}`).join('\n')}\n`);
 const result = spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','30','-keyout',key,'-out',cert,'-config',config],{encoding:'utf8'});
 if (result.status !== 0) {console.error('Could not generate the local HTTPS certificate. Install OpenSSL and retry.',result.stderr);process.exit(1);}
 chmodSync(key,0o600);writeFileSync(metadata,signature);
}
const watch = process.argv.includes('--watch');
const environment = {...process.env,TIJORI_PHONE_DEV:'1',TIJORI_PHONE_PORT:String(port),TIJORI_PHONE_MODE:watch?'development':'production'};
function printLinks() {
 console.log(`\nTijori · local phone testing (${watch?'development':'optimized'})\nLaptop: https://localhost:${port}`);
 for (const {name,address} of addresses) console.log(`Phone (${name}): https://${address}:${port}`);
 if (!addresses.length) console.log('No private network address found. Connect to Wi-Fi or a phone hotspot, then restart.');
 console.log('Use the same Wi-Fi/hotspot. Scan the QR in the app or open a phone link.');
 console.log('Handle the self-signed certificate warning yourself. No system root certificate is installed.');
 console.log('Keep this terminal running; Ctrl+C stops the server.\n');
}
if (watch) {
 printLinks();
 const child = spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','0.0.0.0','--port',String(port),'--experimental-https','--experimental-https-key',key,'--experimental-https-cert',cert],{stdio:'inherit',env:environment});
 for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
 child.once('exit',code=>process.exit(code ?? 0));
 child.once('error',error=>{console.error(error);process.exit(1);});
} else {
 console.log('Building the optimized phone app before serving. This happens once at launch, not when the phone opens it.');
 const build = spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{stdio:'inherit',env:environment});
 const cancelBuild = ()=>{build.kill('SIGTERM');process.exit(0);};
 for (const signal of ['SIGINT','SIGTERM']) process.on(signal,cancelBuild);
 const code = await new Promise((resolveDone,reject)=>{build.once('exit',resolveDone);build.once('error',reject);});
 for (const signal of ['SIGINT','SIGTERM']) process.off(signal,cancelBuild);
 if (code !== 0) process.exit(typeof code === 'number'?code:1);
 Object.assign(process.env,environment,{NODE_ENV:'production'});
 const next = (await import('next')).default;
 const app = next({dev:false,hostname:'0.0.0.0',port});
 await app.prepare();
 const handle = app.getRequestHandler();
 const server = createHttpsServer({key:readFileSync(key),cert:readFileSync(cert)},(req,res)=>{
  handle(req,res).catch(error=>{console.error(error);if(!res.headersSent){res.statusCode=500;res.end('Unable to load Tijori.');}else res.destroy();});
 });
 server.once('error',error=>{console.error(error);process.exit(1);});
 await new Promise(resolveReady=>server.listen(port,'0.0.0.0',resolveReady));
 printLinks();
 for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{
  server.close(()=>{void app.close().finally(()=>process.exit(0));});
  server.closeIdleConnections();
 });
}
