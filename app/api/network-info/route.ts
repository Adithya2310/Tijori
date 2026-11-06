import { NextResponse } from 'next/server';
import { lanAddresses } from '@/lib/local-network.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
 const enabled = process.env.TICHORI_PHONE_DEV === '1';
 const port = Number(process.env.TICHORI_PHONE_PORT || 3443);
 return NextResponse.json({
  enabled,
  laptopUrl:`https://localhost:${port}`,
  urls:enabled?lanAddresses().map(({name,address})=>({name,url:`https://${address}:${port}`})):[],
 },{headers:{'Cache-Control':'no-store'}});
}
