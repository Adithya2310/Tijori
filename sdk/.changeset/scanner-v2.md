---
"@tijori/core": minor
"@tijori/server": minor
"@tijori/client": minor
"@tijori/react": minor
"@tijori/invoices": minor
---

**Object sign-in (scanner v2): the server now checks the object.**

What changes for users:
- Sign-up is a username plus a one-tap scan (3 angles, object at the centre, no tapping or dragging).
- Login is the username plus one photo.
- The server matches the photo's descriptor against the enrolled object and releases the key envelope only on a match. A different object (a pen for a bottle) is refused, and repeated wrong objects are throttled.

What changes underneath:
- **Fixed preprocessing:** colours are no longer corrupted; the whole object at the centre is kept, not just the part under the point; crops are padded instead of stretched.
- **Descriptors are object-only:** the CLS token plus a mean over the object's own patches, about 1 KB per view.
- **`/v1/object-identities` lists usernames only.**

Breaking:
- Vault state moves to v7 (an additive migration), so 0.1.x servers cannot read it.
- Login takes `{ username, objectQuery }`.
- `ObjectIdentityRecord` is `{ name, address }`.
- Object identities from scanner v1 must sign up again.
- `listServerIdentities` is replaced by `listObjectUsernames`.
- `ObjectCapture` takes `mode` and `onResult`.
