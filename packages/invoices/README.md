# @tijori/invoices

A zero-dependency vendor SDK for billing a Tijori treasury. Vendors create USDT invoices for a vault and get a signed webhook with the Whitechain receipt once a majority of the vault's signers approve the payout together.

```js
import { createInvoiceClient, verifyWebhook } from '@tijori/invoices';

const tijori = createInvoiceClient({ baseUrl: 'https://dao.example', apiPath: '/api/tijori/v1', inboxKey: process.env.TIJORI_INBOX_KEY });
const invoice = await tijori.create({ vendorName: 'Studio', vendorAddress: '0x…', amount: '250', dueDate: '2026-12-01', externalId: 'INV-1', webhookUrl: 'https://studio.example/hooks/tijori' });

// Webhook handler: use the raw request body.
if (!verifyWebhook(rawBody, req.headers['tijori-signature'], process.env.TIJORI_WEBHOOK_SECRET)) return 400;
```

- **Setup:** A vault member issues the inbox key, webhook secret and endpoint from **Invoice inbox → Show inbox key**.
- **Retries:** Reusing `externalId` returns the existing invoice instead of creating a duplicate.
- **Reminders:** `remind(id)` sends one, at most once per hour.
- **Webhook headers:** treasuries send both `Tijori-Signature` and the older `Tichori-Signature`, with the same value.

Keep the inbox key and webhook secret on your server. Testnet demo only: no real funds.
