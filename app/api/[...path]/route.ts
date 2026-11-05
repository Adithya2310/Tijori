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
function state() {
 const wallets = all('SELECT * FROM wallets ORDER BY created_at, rowid');
 const groups = all('SELECT * FROM groups ORDER BY created_at DESC, rowid DESC').map(g => ({...g, members: all('SELECT w.* FROM wallets w JOIN members m ON m.wallet_id=w.id WHERE m.group_id=? ORDER BY w.created_at,w.rowid', String(g.id))}));
 const transactions = all('SELECT t.*, g.name group_name, g.frequency, w.name sender_name FROM transactions t JOIN groups g ON g.id=t.group_id JOIN wallets w ON w.id=t.sender_id ORDER BY t.created_at DESC,t.rowid DESC').map(t => ({...t, approvals: all('SELECT w.id,w.name FROM approvals a JOIN wallets w ON w.id=a.wallet_id WHERE a.transaction_id=?', String(t.id))}));
 return {wallets,groups,transactions};
}
export async function GET() { return NextResponse.json(state()); }
export async function POST(req: NextRequest, ctx: {params: Promise<{path:string[]}>}) {
 try {
  const {path} = await ctx.params; const action=path.join('/'); const b=await req.json();
  db.exec('BEGIN IMMEDIATE');
  try {
   if(action==='wallets') { const name=str(b.name), object=str(b.objectName); if(!name || !object) throw Error('Please enter a name and an object.'); run('INSERT INTO wallets(id,name,object_name) VALUES(?,?,?)',randomUUID(),name,object); }
   else if(action==='groups') { const name=str(b.name); const ids=Array.isArray(b.memberIds)? [...new Set(b.memberIds.filter((x:unknown)=>typeof x==='string'))] as string[] : []; if(!name || ids.length<2) throw Error('Choose a group name and at least two members.'); if(ids.some(id=>!one('SELECT id FROM wallets WHERE id=?',id))) throw Error('A selected wallet no longer exists.'); const id=randomUUID(); run('INSERT INTO groups(id,name,frequency) VALUES(?,?,?)',id,name,18000+Math.floor(Math.random()*1500)); for(const wallet of ids) run('INSERT INTO members VALUES(?,?)',id,wallet); }
   else if(action==='transactions') { const group=str(b.groupId), sender=str(b.senderId), recipient=str(b.recipient), asset=str(b.asset), note=str(b.note), amount=Number(b.amount); if(!one('SELECT 1 FROM members WHERE group_id=? AND wallet_id=?',group,sender)) throw Error('The sender must be a group member.'); if(!recipient || !asset || !Number.isFinite(amount) || amount<=0) throw Error('Enter a recipient and a valid positive amount.'); const id=randomUUID(); run('INSERT INTO transactions(id,group_id,sender_id,recipient,amount,asset,note) VALUES(?,?,?,?,?,?,?)',id,group,sender,recipient,amount,asset,note); run('INSERT INTO approvals(transaction_id,wallet_id) VALUES(?,?)',id,sender); }
   else if(action==='approve') { const id=str(b.transactionId), wallet=str(b.walletId); const tx=one('SELECT * FROM transactions WHERE id=?',id); if(!tx || tx.status!=='pending') throw Error('This transaction is no longer pending.'); if(!one('SELECT 1 FROM members WHERE group_id=? AND wallet_id=?',String(tx.group_id),wallet)) throw Error('Only group members can approve.'); if(one('SELECT 1 FROM approvals WHERE transaction_id=? AND wallet_id=?',id,wallet)) throw Error('This wallet has already approved.'); run('INSERT INTO approvals(transaction_id,wallet_id) VALUES(?,?)',id,wallet); const count=Number(one('SELECT COUNT(*) n FROM approvals WHERE transaction_id=?',id)?.n); const members=Number(one('SELECT COUNT(*) n FROM members WHERE group_id=?',String(tx.group_id))?.n); if(count>members/2) run("UPDATE transactions SET status='completed' WHERE id=?",id); }
   else throw Error('Unknown action.');
   db.exec('COMMIT'); return NextResponse.json(state());
  } catch(e) { db.exec('ROLLBACK'); throw e; }
 } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:'Something went wrong.'},{status:400}); }
}
