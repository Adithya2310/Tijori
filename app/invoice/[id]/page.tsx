import { connection } from 'next/server';
import { InvoiceReceipt } from '@tijori/react';
import { tijori } from '@/lib/tijori';

// Public, verifiable receipt for a vendor invoice. The invoice ID is an unguessable capability link.
export default async function InvoiceReceiptPage({ params }: { params: Promise<{ id: string }> }) {
 await connection();
 const { id } = await params;
 let invoice: Awaited<ReturnType<typeof tijori.invoiceReceipt>> = null;
 try { invoice = /^[0-9a-f-]{36}$/.test(id) ? await tijori.invoiceReceipt(id) : null; } catch { invoice = null; }
 return <InvoiceReceipt invoice={invoice} />;
}
