import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createHandler,available} from '../netlify/functions/recording-available.mjs';
import {memoryDatabase} from '../scripts/memory-store.mjs';
const now=Date.parse('2026-10-15T20:00:00Z'), prefix='2026-10-14/11111111-1111-4111-8111-111111111111';
const meta={key:prefix,started:now-86400000,expires:now+86400000,consentReceipt:{version:2,replay:true,expires:now+86400000}};
test('reporting excludes tests, withdrawn, expired and missing consent recordings',()=>{
 assert.equal(available(meta,prefix,now),true);
 for(const changes of [{deleted:true},{test:true},{expires:now},{consentReceipt:null},{consentReceipt:{version:2,replay:false,expires:now+86400000}},{key:'other'}])assert.equal(available({...meta,...changes},prefix,now),false);
});
test('reporting check authenticates bytes, timestamp and production context; returns only a boolean',async()=>{
 const db=memoryDatabase();await db.sessions.setJSON(prefix,{...meta,visitorId:'private'});
 process.env.KLEM_REPORT_INGEST_KEY='synthetic-key-'.repeat(4);
 const raw=JSON.stringify({prefix}),stamp=String(now/1000),signature='sha256='+createHmac('sha256',process.env.KLEM_REPORT_INGEST_KEY).update(`recording-availability\n${stamp}\n${raw}`).digest('hex');
 const req=(headers={})=>new Request('https://klem.co.il/internal/recording-available',{method:'POST',body:raw,headers:{'x-klem-time':stamp,'x-klem-signature':signature,...headers}});
 const run=createHandler(()=>db,()=>now);
 assert.deepEqual(await (await run(req())).json(),{available:true});
 assert.equal((await run(req({'x-klem-signature':'bad'}))).status,403);
 assert.equal((await run(req({'x-klem-time':String(now/1000-61)}))).status,403);
 db.production=false;assert.equal((await run(req())).status,403);
});
