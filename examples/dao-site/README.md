# Example: Builders DAO site

A separate Next.js app that adds the Tijori treasury to a DAO website with the published packages. It shows the minimum integration:

- `lib/tijori.ts`: the self-hosted backend (`createTijoriServer`, local encrypted file storage by default).
- `app/api/tijori/[...path]/route.ts`: mounts it with `toNextHandlers`.
- `app/page.tsx`: `<TijoriProvider>` plus `<TijoriApp/>` with a custom name and accent colour.
- `app/invoice/[id]/page.tsx`: public invoice receipts.

```sh
npm install                    # from the repository root (npm workspaces)
npm run build:packages         # the example consumes the built packages, like an npm install would
npm run dev -w examples/dao-site   # prepares model assets, then http://127.0.0.1:3200
```

Without Whitechain settings, the site offers acoustic groups. To enable gasless Whitechain vaults, add the `WHITECHAIN_*` and `TIJORI_*` settings from the repository's `.env.example` to `examples/dao-site/.env.local`. Data is stored in `examples/dao-site/data/` (git-ignored). Demo only: testnet tokens, no real funds.
