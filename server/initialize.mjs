import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { failure } from './security.mjs';
export const memberTables = ['users','invitations','auth_tokens','sessions','rate_limits','conversations','messages','reactions','push_subscriptions','push_deliveries'];
export function authorizeSetup(request,env){
 const secret=env.AUTH_SECRET;
 const supplied=Buffer.from(request.headers.get('x-setup-key')||'');
 const expected=Buffer.from(secret||'');
 if(!secret||secret.length<32||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw failure(403,'Setup access denied.');
}
async function existingTables(db){return (await db.query("select table_name from information_schema.tables where table_schema='public' and table_name=any($1::text[])",[memberTables])).rows.map(row=>row.table_name)}
export async function initializeMembers(db){
 const client=await db.connect();
 try{
  await client.query('begin');
  await client.query('select pg_advisory_xact_lock(20261024)');
  const existing=await existingTables(client);
  if(existing.length===memberTables.length){await client.query('commit');return {initialized:false,ready:true}}
  if(existing.length)throw failure(409,'A partial or existing schema was found. Automatic setup stopped to preserve it; review the migration manually.');
  const sql=fs.readFileSync(path.join(process.cwd(),'database/001_members.sql'),'utf8').replace(/^\s*begin;\s*/i,'').replace(/\s*commit;\s*$/i,'');
  await client.query(sql);
  const created=await existingTables(client);
  if(created.length!==memberTables.length)throw new Error('Schema verification failed');
  await client.query('commit');return {initialized:true,ready:true};
 }catch(error){await client.query('rollback');throw error}finally{client.release()}
}
