# @tijori/invoices

## 0.2.0

### Minor Changes

- 95baa5f: **Object sign-in (scanner v2): the server now checks the object.**

  What changes for users:

  - Sign-up is a username plus a one-tap scan (3 angles, object at the centre, no tapping or dragging).
  - Login is the username plus one photo.
  - The server matches the photo's descriptor against the enrolled object and releases the key envelope only on a match. A different object (a pen for a bottle) is refused, and repeated wrong objects are throttled.

  What changes underneath:

  - **Fixed preprocessing:** colours are no longer corrupted; crops are padded instead of stretched.
  - **The object is isolated inside an on-screen guide circle,** which leaves out the hand or face holding it.
  - **New option "Not your object? Brush over it"** lets the user paint over the object; the painting becomes SAM prompts.
  - **The shipped threshold is 0.80.** On real photos, different objects score 0.12–0.33.
  - **Descriptors are object-only:** the CLS token plus a mean over the object's own patches, about 1 KB per view.
  - **`/v1/object-identities` lists usernames only.**

  Breaking:

  - Vault state moves to v7 (an additive migration), so 0.1.x servers cannot read it.
  - Login takes `{ username, objectQuery }`.
  - `ObjectIdentityRecord` is `{ name, address }`.
  - Object identities from scanner v1 must sign up again.
  - `listServerIdentities` is replaced by `listObjectUsernames`.
  - `ObjectCapture` takes `mode` and `onResult`.

## 0.1.0

### Minor Changes

- First public release of the Tijori SDK. It covers:

  - object sign-up and sign-in with on-device DINOv2
  - gasless Whitechain vaults with co-present approvals, USDT payouts and a vendor invoice inbox
  - acoustic proof of attendance

  The release includes a self-hosted backend (`@tijori/server`), browser building blocks (`@tijori/client`), a drop-in React app with composable components (`@tijori/react`) and a vendor billing SDK (`@tijori/invoices`).
