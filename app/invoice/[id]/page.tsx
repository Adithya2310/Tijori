import { connection } from 'next/server';
import { invoiceReceipt } from '@/lib/api/treasury';

// Public, verifiable receipt for a vendor invoice. The invoice ID is an unguessable capability link.
export default async function InvoiceReceipt({ params }: { params: Promise<{ id: string }> }) {
 await connection();
 const { id } = await params;
 let invoice: Awaited<ReturnType<typeof invoiceReceipt>> = null;
 try { invoice = /^[0-9a-f-]{36}$/.test(id) ? await invoiceReceipt(id) : null; } catch { invoice = null; }
 if (!invoice) return <main className="receipt-shell"><div className="receipt-card"><h1>Invoice not found</h1><p>Check the link from your vendor or treasury.</p></div></main>;
 const paid = invoice.status === 'paid';
 return <main className="receipt-shell"><div className="receipt-card">
  <div className="section-kicker">TICHORI INVOICE RECEIPT</div>
  <h1>{invoice.amount} {invoice.asset}</h1>
  <span className={'receipt-status' + (paid ? ' paid' : '')}>{paid ? 'Paid on Whitechain' : invoice.overdue ? 'Overdue' : 'Awaiting co-present approval'}</span>
  <div className="details" style={{ marginTop: 22 }}>
   <div><span>From</span><strong>{invoice.vendorName}</strong></div>
   <div><span>Billed to</span><strong>{invoice.vault.name}</strong></div>
   <div><span>Memo</span><strong>{invoice.memo || '—'}</strong></div>
   <div><span>Due</span><strong>{invoice.dueDate}</strong></div>
   {invoice.externalId && <div><span>Reference</span><strong>{invoice.externalId}</strong></div>}
   {invoice.payment && <><div><span>Paid at</span><strong>{new Date(invoice.payment.paidAt!).toUTCString()}</strong></div><div><span>Approved together by</span><strong>{invoice.payment.approvals} signers in one session</strong></div><div><span>Transaction</span><strong><a href={invoice.payment.explorerUrl} target="_blank" rel="noreferrer">{invoice.payment.txHash.slice(0, 18)}…</a></strong></div></>}
  </div>
  <p className="form-hint">{paid ? `Paid from the treasury Safe ${invoice.vault.address} on Whitechain Sepolia. Anyone can verify the USDT transfer and the co-presence attestation on the explorer.` : `Billed to the treasury Safe ${invoice.vault.address} on Whitechain Sepolia. It is paid once a majority of its signers approve together in one session.`} Demo only: test tokens, no real funds.</p>
 </div></main>;
}
