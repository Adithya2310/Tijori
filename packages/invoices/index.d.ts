export type InvoiceInput = { vendorName: string; vendorAddress: string; amount: string; memo?: string; dueDate: string; externalId?: string; webhookUrl?: string };
export type Invoice = {
 id: string; externalId: string | null; vault: { name: string; address: string }; vendorName: string; vendorAddress: string;
 amount: string; asset: 'USDT'; memo: string; dueDate: string; status: 'open' | 'paid'; overdue: boolean; reminders: number; createdAt: string;
 payment: { txHash: string; explorerUrl: string; paidAt: string; approvals: number; sessionId: string | null } | null;
 receiptUrl: string;
};
export type InvoicePaidEvent = { type: 'invoice.paid'; invoice: Omit<Invoice, 'receiptUrl'> };
export declare class TichoriError extends Error { status?: number }
export declare function createInvoiceClient(options: { baseUrl: string; inboxKey: string; fetch?: typeof fetch }): {
 create(input: InvoiceInput): Promise<Invoice>;
 retrieve(id: string): Promise<Invoice>;
 remind(id: string): Promise<Omit<Invoice, 'receiptUrl'>>;
};
export declare function verifyWebhook(rawBody: string, header: string | null | undefined, secret: string, toleranceSeconds?: number, now?: number): boolean;
