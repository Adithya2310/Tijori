# @tijori/core

Isomorphic building blocks shared by [`@tijori/server`](https://www.npmjs.com/package/@tijori/server), [`@tijori/client`](https://www.npmjs.com/package/@tijori/client) and [`@tijori/react`](https://www.npmjs.com/package/@tijori/react):

- The vault schema and migrations.
- Proximity rules.
- Whitechain constants and EIP-712 SafeTx / co-presence attestation helpers.
- Treasury rules.
- DINOv2 feature maths and compact object profiles.
- Browser-side identity key encryption.
- Provider interfaces.
- The `/v1` wire types (`@tijori/core/api/types`).

`@tijori/core/legacy` lists persisted identifiers that keep their original spelling (storage keys, encryption contexts, the deployed guard's EIP-712 domain). Changing them would lock users out of existing identities and data.

You rarely need to install this package directly; the other Tijori packages depend on it.
