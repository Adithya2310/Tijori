'use client';
import type { LocalAccount } from 'viem';

// The unlocked identity signer lives only in this tab's memory. It is never written to storage,
// sent to the server or logged; reloading the page or signing out forgets it.
let current: LocalAccount | null = null;
export const setSessionSigner = (account: LocalAccount | null) => { current = account; };
export const sessionSigner = (address?: string | null) => (current && address && current.address.toLowerCase() === address.toLowerCase() ? current : null);
