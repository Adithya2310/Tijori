# @tijori/react

React components for Tijori: object sign-in, Whitechain vaults and treasury, and acoustic attendance. Pair it with a self-hosted [`@tijori/server`](https://www.npmjs.com/package/@tijori/server).

```tsx
import '@tijori/react/styles.css';
import { TijoriApp, TijoriProvider } from '@tijori/react';

export default function Treasury() {
  return <TijoriProvider baseUrl="/api/tijori/v1" assetBaseUrl="/tijori-assets/" theme={{ accent: '#7c5cff' }}>
    <TijoriApp name="Builders DAO" />
  </TijoriProvider>;
}
```

- **Drop-in:** `<TijoriApp/>` provides sign-up and sign-in, the vault list, gasless vault creation, the treasury (proposals, co-present approvals, invoice inbox, gas tank) and acoustic checks. Slots add your own content.
- **Composable:**
  - Sign-in: `TijoriAuth`, `ObjectSignUp`, `ObjectSignIn`.
  - Vaults: `VaultList`, `CreateVault`, `CreateAcousticGroup`, `VaultTreasury`.
  - Attendance: `AttendanceCheck`, `ProximityCheck`.
  - Receipts: `InvoiceReceipt`, which also works as a server component.
  - Hooks: `useTijori`, `useIdentity` and `useVaults`.
- **Styling:**
  - Classes are scoped with a `tj-` prefix inside `@layer tijori`, so your unlayered CSS wins.
  - Theme with the `theme` prop or `--tj-*` CSS variables.
  - Fonts default to DM Sans and DM Serif Display when they are loaded; set `theme.font` / `theme.fontDisplay` to use your own.
- **Presence:** connect a real ultrasonic emitter and listener with `onPresenceEmit` and `presence`.

See the [integration guide](https://github.com/Adithya2310/Tijori/blob/main/docs/SDK.md).
