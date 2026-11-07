# @tijori/react

## 0.2.0

### Minor Changes

- 95baa5f: **Object sign-in (scanner v2): the server now checks the object.**

  What changes for users:

  - Sign-up is a username plus a one-tap scan (3 angles, object at the centre, no tapping or dragging).
  - Login is the username plus one photo.
  - The server matches the photo's descriptor against the enrolled object and releases the key envelope only on a match. A different object (a pen for a bottle) is refused, and repeated wrong objects are throttled.
  - **One payout flow: every member together.** A vault is created from registered people, and every payout runs only after a payment check: the initiator's device plays a 6-character code (audible or ultrasound, ggwave), every member's device hears it and each member's own key signs. No extra photo: the key was unlocked by the object login.

  What changes underneath:

  - **Fixed preprocessing:** colours are no longer corrupted; crops are padded instead of stretched.
  - **The object is isolated inside an on-screen guide circle,** which leaves out the hand or face holding it.
  - **New option "Not your object? Brush over it"** lets the user paint over the object; the painting becomes SAM prompts.
  - **The shipped threshold is 0.55.** On real photos, different objects score 0.12–0.33, so this keeps a wide gap while accepting natural angle and lighting changes. Wrong objects are throttled at 8 per 2 minutes per identity.
  - **Descriptors are object-only:** the CLS token plus a mean over the object's own patches, about 1 KB per view.
  - **`/v1/object-identities` lists usernames only.**
  - **Faster scanning:**
    - The models preload when the sign-in form opens and stay loaded in one worker for the whole visit.
    - DINOv2 runs at 8-bit precision (24 MB instead of 88 MB), and WebGPU for object isolation is available as an opt-in.
    - The models use several CPU threads on cross-origin isolated pages.
    - A first visit downloads about 53 MB instead of 117 MB, and one photo takes about 1.8 s instead of 5.5 s on a recent laptop.
    - New: `preloadObjectModels()`, `configureAssets({ accelerator })`, and `ObjectCapture`'s `preload` prop.
    - Re-run `tijori-client prepare-assets` after upgrading.

  Breaking:

  - Vault state moves to v7 (an additive migration), so 0.1.x servers cannot read it.
  - Login takes `{ username, objectQuery }`.
  - `ObjectIdentityRecord` is `{ name, address }`.
  - Object identities from scanner v1 must sign up again.
  - `listServerIdentities` is replaced by `listObjectUsernames`.
  - `ObjectCapture` takes `mode` and `onResult`.
  - New Whitechain vaults need every owner (Safe threshold = owners; earlier majority vaults keep working), and every member must be a registered identity.
  - The default presence provider is `ggwave-acoustic` (live): the code goes only to the initiator and is never listed. `simulatedPresenceProvider` is the opt-in audio-free variant.
  - `TijoriApp` shows only Whitechain vaults and no standalone acoustic groups (`createMode="acoustic-group"` or `renderVault` bring them back); `CreateVault` picks members from Registered people.

### Patch Changes

- Updated dependencies [95baa5f]
  - @tijori/core@0.2.0
  - @tijori/client@0.2.0

## 0.1.0

### Minor Changes

- First public release of the Tijori SDK. It covers:

  - object sign-up and sign-in with on-device DINOv2
  - gasless Whitechain vaults with co-present approvals, USDT payouts and a vendor invoice inbox
  - acoustic proof of attendance

  The release includes a self-hosted backend (`@tijori/server`), browser building blocks (`@tijori/client`), a drop-in React app with composable components (`@tijori/react`) and a vendor billing SDK (`@tijori/invoices`).

### Patch Changes

- Updated dependencies
  - @tijori/core@0.1.0
  - @tijori/client@0.1.0
