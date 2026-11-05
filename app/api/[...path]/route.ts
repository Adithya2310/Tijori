import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import db from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Row = Record<string, unknown>;
const all = (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as Row[];
const one = (sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as Row | undefined;
const run = (sql: string, ...args: (string | number)[]) => db.prepare(sql).run(...args);
const str = (x: unknown) => typeof x === 'string' ? x.trim() : '';
const normalize = (x: unknown) => str(x).toLowerCase();
function state() {
 const wallets = all('SELECT id,name,world_id FROM wallets ORDER BY created_at, rowid');
 const groups = all('SELECT id,name,created_at FROM groups ORDER BY created_at DESC, rowid DESC').map(g => ({...g, members: all('SELECT w.id,w.name,w.world_id FROM wallets w JOIN members m ON m.wallet_id=w.id WHERE m.group_id=? ORDER BY w.created_at,w.rowid', String(g.id))}));
 const transactions = all('SELECT t.*, g.name group_name, w.name sender_name FROM transactions t JOIN groups g ON g.id=t.group_id JOIN wallets w ON w.id=t.sender_id ORDER BY t.created_at DESC,t.rowid DESC').map(t => ({...t, approvals: all('SELECT w.id,w.name,w.world_id FROM approvals a JOIN wallets w ON w.id=a.wallet_id WHERE a.transaction_id=?', String(t.id))}));
 return {wallets,groups,transactions};
}
export async function GET() { return NextResponse.json(state()); }
export async function POST(req: NextRequest, ctx: {params: Promise<{path:string[]}>}) {
 try {
  const {path} = await ctx.params; const action=path.join('/'); const b=await req.json(); let identityId: string | undefined;
  db.exec('BEGIN IMMEDIATE');
  try {
   if(action==='signup') {
    const name=str(b.name), object=str(b.objectName), world=normalize(b.worldId);
    if(!name || !object || !world) throw Error('Enter your name, World ID and object.');
    const existing=one('SELECT id,object_name FROM wallets WHERE world_id=? COLLATE NOCASE',world);
    if(existing && existing.object_name) throw Error('This World ID is already registered. Please log in.');
    if(existing) {identityId=String(existing.id); run('UPDATE wallets SET name=?,object_name=? WHERE id=?',name,object,identityId);}
    else {identityId=randomUUID();run('INSERT INTO wallets(id,name,object_name,world_id) VALUES(?,?,?,?)',identityId,name,object,world);}
   }
   else if(action==='login') {
    const user=one('SELECT id FROM wallets WHERE world_id=? COLLATE NOCASE AND object_name=? AND object_name<>?',normalize(b.worldId),str(b.objectName),'');
    if(!user) throw Error('World ID or object did not match. Please try again.');
    identityId=String(user.id);
   }
   else if(action==='groups') {
    const name=str(b.name), creator=str(b.creatorId);
    const worlds=Array.isArray(b.worldIds)? [...new Set(b.worldIds.map(normalize).filter(Boolean))] as string[] : [];
    const owner=one('SELECT id,world_id FROM wallets WHERE id=? AND object_name<>?',creator,'');
    if(!name || !owner) throw Error('Enter a group name and sign in first.');
    const others=worlds.filter(w=>w!==normalize(owner.world_id));
    if(!others.length) throw Error('Add at least one other member by World ID.');
    const id=randomUUID();
    // The mock code is private server-side state; it is never returned in API responses.
    run('INSERT INTO groups(id,name,frequency) VALUES(?,?,?)',id,name,randomUUID());
    run('INSERT INTO members VALUES(?,?)',id,creator);
    for(const world of others) {let member=one('SELECT id FROM wallets WHERE world_id=? COLLATE NOCASE',world); if(!member){const memberId=randomUUID();run('INSERT INTO wallets(id,name,object_name,world_id) VALUES(?,?,?,?)',memberId,world,'',world);member={id:memberId};} run('INSERT INTO members VALUES(?,?)',id,String(member.id));}
   }
   else if(action==='transactions') { const group=str(b.groupId), sender=str(b.senderId), recipient=str(b.recipient), asset=str(b.asset), note=str(b.note), amount=Number(b.amount); if(!one('SELECT 1 FROM members WHERE group_id=? AND wallet_id=?',group,sender)) throw Error('The sender must be a group member.'); if(!recipient || !asset || !Number.isFinite(amount) || amount<=0) throw Error('Enter a recipient and a valid positive amount.'); const id=randomUUID(); run('INSERT INTO transactions(id,group_id,sender_id,recipient,amount,asset,note) VALUES(?,?,?,?,?,?,?)',id,group,sender,recipient,amount,asset,note); run('INSERT INTO approvals(transaction_id,wallet_id) VALUES(?,?)',id,sender); }
   else if(action==='approve') { const id=str(b.transactionId), wallet=str(b.walletId); const tx=one('SELECT * FROM transactions WHERE id=?',id); if(!tx || tx.status!=='pending') throw Error('This transaction is no longer pending.'); if(!one('SELECT 1 FROM members WHERE group_id=? AND wallet_id=?',String(tx.group_id),wallet)) throw Error('Only group members can approve.'); if(one('SELECT 1 FROM approvals WHERE transaction_id=? AND wallet_id=?',id,wallet)) throw Error('This wallet has already approved.'); run('INSERT INTO approvals(transaction_id,wallet_id) VALUES(?,?)',id,wallet); const count=Number(one('SELECT COUNT(*) n FROM approvals WHERE transaction_id=?',id)?.n); const members=Number(one('SELECT COUNT(*) n FROM members WHERE group_id=?',String(tx.group_id))?.n); if(count>members/2) run("UPDATE transactions SET status='completed' WHERE id=?",id); }
   else throw Error('Unknown action.');
   db.exec('COMMIT'); return NextResponse.json({...state(),...(identityId?{identityId}:{})});
  } catch(e) { db.exec('ROLLBACK'); throw e; }
 } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:'Something went wrong.'},{status:400}); }
}
