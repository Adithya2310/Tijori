// Priya Studio: a separate vendor app that bills a Tichori treasury in USDT on Whitechain.
// Run: TICHORI_URL=http://127.0.0.1:3000 TICHORI_INBOX_KEY=... TICHORI_WEBHOOK_SECRET=... \
//      VENDOR_ADDRESS=0x... node examples/vendor-studio/server.mjs   (then open http://127.0.0.1:4100)
import { createServer } from 'node:http';
const invoices = new Map(); // your app's own database
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const page = () => `<!doctype html><meta charset="utf-8"><title>Priya Studio · Billing</title>
<style>body{font:15px system-ui;max-width:640px;margin:40px auto;padding:0 16px;color:#1f2937}input,button{font:inherit;padding:8px;margin:4px 0}table{width:100%;border-collapse:collapse;margin-top:20px}td{padding:8px;border-top:1px solid #e5e7eb}.paid{color:#047857;font-weight:600}</style>
<h1>Priya Studio</h1><p>Bill the Builders DAO treasury. They pay in USDT on Whitechain once a majority of their signers approve together.</p>
<form method="post" action="/bill"><input name="memo" placeholder="What did you deliver?" required> <input name="amount" placeholder="USDT, e.g. 500" required> <input name="due" type="date" required> <button>Send invoice</button></form>
<table>${[...invoices.values()].reverse().map(i => `<tr><td>${esc(i.memo)}</td><td>${esc(i.amount)} USDT</td><td>due ${esc(i.dueDate)}</td><td class="${esc(i.status)}">${i.status === 'paid' ? `Paid · <a href="${esc(i.payment.explorerUrl)}">Whitechain tx</a>` : 'Awaiting DAO'}</td><td><a href="${esc(i.receiptUrl)}">receipt</a></td></tr>`).join('')}</table>`;

// ---- Tichori integration (the whole thing) -------------------------------------------------
import { createInvoiceClient, verifyWebhook } from '../../packages/tichori-invoices/index.mjs';
const tichori = createInvoiceClient({ baseUrl: process.env.TICHORI_URL, inboxKey: process.env.TICHORI_INBOX_KEY });
async function bill({ memo, amount, due }) {
 const invoice = await tichori.create({ vendorName: 'Priya Studio', vendorAddress: process.env.VENDOR_ADDRESS, amount, memo, dueDate: due,
  externalId: `PS-${Date.now()}`, webhookUrl: `http://127.0.0.1:${PORT}/webhooks/tichori` });
 invoices.set(invoice.id, invoice);
}
async function onWebhook(raw, signature) {
 if (!verifyWebhook(raw, signature, process.env.TICHORI_WEBHOOK_SECRET)) return 400;
 const event = JSON.parse(raw);
 if (event.type === 'invoice.paid') invoices.set(event.invoice.id, { ...invoices.get(event.invoice.id), ...event.invoice });
 return 200;
}
// ---------------------------------------------------------------------------------------------

const PORT = Number(process.env.PORT || 4100);
createServer(async (req, res) => {
 let raw = ''; for await (const chunk of req) raw += chunk;
 try {
  if (req.method === 'POST' && req.url === '/bill') { await bill(Object.fromEntries(new URLSearchParams(raw))); res.writeHead(303, { Location: '/' }); return res.end(); }
  if (req.method === 'POST' && req.url === '/webhooks/tichori') { res.writeHead(await onWebhook(raw, req.headers['tichori-signature'])); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page());
 } catch (e) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end(String(e.message)); }
}).listen(PORT, '127.0.0.1', () => console.log(`Priya Studio on http://127.0.0.1:${PORT}`));
