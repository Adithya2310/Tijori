'use client';

import { useEffect } from 'react';
import { startAnonRpcHost } from '@tijori/client/anon-rpc-host';

// Hidden same-origin host page for Anon RPC reads (see @tijori/client/anon-rpc).
export default function HarnessHost() {
 useEffect(() => startAnonRpcHost(), []);
 return null;
}
