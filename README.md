# Privacy Vault

A local, mock-first prototype for groups to review transactions together. Sign up using a demo World ID and object description, create a group by entering member World IDs, send a request, then log in as another member and receive and approve it. A strict majority completes the simulated request; the sender counts as the first approval.

## Run locally

Requires Node.js 22.20 or later and npm.

```sh
npm install
npm run dev
```

Visit http://localhost:3000. Data is saved in `data/vault.sqlite`. Delete that file with the server stopped to reset the demo. `npm run build` checks the production build; `npm run lint` checks the code, and `npm test` runs an isolated API flow against the latest production build (run `npm run build` first). See [AGENTS.md](AGENTS.md) for architecture and parallel integration work.

**Demo only:** no actual wallet, object scan, microphone, frequency signal, World ID, Arkiv, Anon RPC, blockchain transaction, authentication, or physical proximity verification is implemented. Never use this prototype for real funds or sensitive information. Anyone with access to this local app can switch identities and approve. SQLite is local and is not suitable for multi-device deployment as configured.

Demo balances are zero-value placeholders, shown separately by asset; they do not reflect transactions or real holdings. Group codes are generated server-side and omitted from API responses, but no audio is transmitted and no microphone is used. Invited World IDs become usable when the corresponding demo identity signs up. Legacy identities receive a `legacy-<id>` World ID during migration.
