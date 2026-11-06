// @tijori/react: drop-in and composable UI for Tijori. Import '@tijori/react/styles.css' once in your app.
export { TijoriProvider, useTijori, useIdentity, useVaults, type TijoriProviderProps, type TijoriContextValue, type TijoriTheme, type PresenceListener, type PresenceEmit, type ObjectIdentityBody, type TijoriIdentity } from './context.tsx';
export { TijoriApp, AttendanceCheck, GroupMembers, type TijoriAppProps } from './components/TijoriApp.tsx';
export { TijoriAuth, ObjectSignUp, ObjectSignIn, type AuthAlternative } from './components/TijoriAuth.tsx';
export { VaultList } from './components/VaultList.tsx';
export { CreateVault, CreateAcousticGroup } from './components/CreateVault.tsx';
export { VaultTreasury } from './components/VaultTreasury.tsx';
export { Modal } from './components/Modal.tsx';
export { InvoiceReceipt } from './components/InvoiceReceipt.tsx';
export { default as ProximityCheck } from './components/ProximityCheck.tsx';
export { default as ObjectIdentityForm } from './components/ObjectIdentityForm.tsx';
export { default as ObjectCapture } from './components/ObjectCapture.tsx';
export { default as CameraCapture } from './components/CameraCapture.tsx';
