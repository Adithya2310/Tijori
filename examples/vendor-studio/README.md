# Priya Studio: example vendor app

A separate app (plain Node, no framework) that bills a Tichori treasury using `@tichori/invoices`.
The marked block in `server.mjs` is the entire integration (about 20 lines): create an invoice, then
verify the signed `invoice.paid` webhook and store the Whitechain payment proof.

1. In Tichori, open a Whitechain vault, then **Invoice inbox → Show inbox key**.
2. Start the vendor app with that key, the webhook secret, and the address that should receive USDT:

   ```bash
   TICHORI_URL=http://127.0.0.1:3000 TICHORI_INBOX_KEY=tinbox_... TICHORI_WEBHOOK_SECRET=whsec_... \
   VENDOR_ADDRESS=0xYourVendorAddress node examples/vendor-studio/server.mjs
   ```
3. Open http://127.0.0.1:4100 and send an invoice. It appears in the vault's inbox, where the signers
   propose payment and approve it together. The vendor page flips to **Paid** with the explorer link.

For local webhooks, the Tichori server needs `TICHORI_WEBHOOK_ALLOW_PRIVATE=1`.
