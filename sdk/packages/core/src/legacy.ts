/**
 * Frozen identifiers. These were created under the project's earlier name ("Tichori") and are persisted in user
 * data, cryptographic contexts or deployed contracts. Changing any of them would lock users out of existing
 * identities and state or break the live Whitechain contracts, so they stay exactly as they are.
 */
/** AES-GCM additional data prefix for passphrase/object-wrapped identity keys. */
export const LEGACY_IDENTITY_AAD_PREFIX = 'tichori-identity-v1:';
/** Object-recovery wrapping-password domain and recovery file kind. */
export const LEGACY_OBJECT_WRAP_DOMAIN = 'tichori-insecure-object-demo-v1:';
export const LEGACY_OBJECT_RECOVERY_KIND = 'tichori-insecure-object-demo';
/** `object_name` of object identities from scanner v1 (0.1.x). They must enroll again with scanner v2. */
export const LEGACY_DINO_OBJECT_NAME = 'dino-object-demo-v1';
/** Browser storage: IndexedDB for remembered object identities, pending legacy Safe deployment, Web Lock name. */
export const LEGACY_IDENTITY_DB = 'tichori-object-identities';
export const LEGACY_PENDING_SAFE_KEY = 'tichori-pending-safe-v1';
export const LEGACY_SAFE_DEPLOY_LOCK = 'tichori-safe-deployment';
export const LEGACY_PROXIMITY_SESSION_PREFIX = 'tichori-proximity:';
/** Arkiv aggregate entity schema, encoding tag and default namespace. */
export const LEGACY_ARKIV_SCHEMA = 'tichori_state_v1';
export const LEGACY_ARKIV_ENCODING = 'tichori/aes-256-gcm/v1';
export const LEGACY_ARKIV_NAMESPACE = 'tichori-local-v1';
/** AES-GCM context for the local encrypted file store. */
export const LEGACY_LOCAL_STORE_CONTEXT = 'tichori-local-acoustic-demo-v1';
/** HKDF info for derived vendor inbox keys and webhook secrets. */
export const LEGACY_API_KEYS_INFO = 'tichori-api-keys-v1';
/** EIP-712 domain name compiled into the deployed TichoriPresenceGuard contract. */
export const LEGACY_GUARD_DOMAIN_NAME = 'TichoriPresenceGuard';
/** First line of the EIP-191 message members sign to be issued an inbox key. */
export const LEGACY_INBOX_KEY_MESSAGE_PREFIX = 'Tichori: issue the invoice inbox key';
