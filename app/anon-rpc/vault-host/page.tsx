'use client';
import { useEffect } from 'react';
import { startVaultReadHost } from '../../../lib/anon-vault-host';

export default function VaultReadHost() {
 useEffect(() => startVaultReadHost(), []);
 return null;
}
