import { connection } from 'next/server';
import { InvoiceReceipt } from '@tijori/react';
import { tijori } from '@/lib/tijori';

export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
 await connection();
 const { id } = await params;
 const invoice = /^[0-9a-f-]{36}$/.test(id) ? await tijori.invoiceReceipt(id).catch(() => null) : null;
 return <InvoiceReceipt invoice={invoice} name="Builders DAO" />;
}
