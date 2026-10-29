import {SOCIAL_ACCOUNTS} from '../marketing/automation/config.mjs';
Object.assign(SOCIAL_ACCOUNTS.facebook,{accountId:null,username:null});
Object.assign(SOCIAL_ACCOUNTS.instagram,{accountId:'17841400000999001',username:'klem.test'});
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {MarketingStore} from '../marketing/automation/store.mjs';
import {InstagramQueue,instagramCalendar,instagramCadence} from '../marketing/automation/instagram.mjs';
import {ManagementBridge,ManagementClient} from '../marketing/automation/management-bridge.mjs';
import {MarketingQualityControl} from '../marketing/automation/quality-control.mjs';
const BASE=new Date('2026-10-25T07:15:00Z'),CID='c'.repeat(32),WID='a'.repeat(32),PUB='b'.repeat(32);
const clone=v=>structuredClone(v);
function setup(t) {
  const root=mkdtempSync(join(tmpdir(),'klem-management-')),store=new MarketingStore(':memory:');
  store.updatePolicy({dailyMinor:15000,monthlyMinor:450000},BASE);
  const ctx={root,store,at:new Date(BASE),calls:[],serverClaims:new Map(),loseClaim:false,claimsCreated:0};
  const client={request:async(endpoint,data)=>{
    ctx.calls.push({endpoint,data:clone(data)});
    if(endpoint==='/state')return clone(ctx.remote);
    if(endpoint==='/bootstrap') {ctx.remote.settings=clone(data.settings);ctx.remote.changes.bootstrap={digest:'bootstrapped'};return {imported:true,revision:1};}
    if(endpoint==='/observed') {ctx.observed=clone(data);return {saved:true};}
    if(endpoint==='/library')return {saved:data.entries.length};
    if(endpoint==='/work/claim') {
      if(!ctx.serverClaims.has(data.workId)) {
        ctx.claimsCreated++;
        const req=ctx.remote.requests.find(w=>w.id===data.workId);
        assert.ok(req);
        const content=ctx.contents[req.payload.contentId];
        ctx.serverClaims.set(data.workId,{...clone(req),claim:'secret-claim-'+data.workId,content:clone(content),settingsRevision:ctx.remote.revision});
        ctx.remote.requests=ctx.remote.requests.filter(w=>w.id!==data.workId);
      }
      if(ctx.loseClaim){ctx.loseClaim=false;throw new Error('Response lost after the server reserved work');}
      return clone(ctx.serverClaims.get(data.workId));
    }
    if(endpoint==='/work/authorize')return {authorized:true,id:data.workId,checkedAt:+ctx.at/1000,settingsRevision:ctx.remote.revision};
    if(endpoint==='/work/finish'){ctx.finishes??=[];ctx.finishes.push(clone(data));return clone(data.result);}
    throw new Error('Unexpected endpoint');
  }};
  const bridge=new ManagementBridge(store,{client,now:()=>ctx.at,assetRoot:root});
  ctx.bridge=bridge;ctx.queue=bridge.queue;
  ctx.remote={revision:1,settings:bridge.existingSettings(),changes:{bootstrap:{digest:'existing'}},requests:[],pending:[],unresolved:[]};
  ctx.contents={};
  t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});return ctx;
}
function request(ctx,operation='generate',channel='instagram') {
  ctx.contents[CID]||={id:CID,revision:1,channel,kind:'post',format:'image',brief:'ניהול ועד בית',status:'generating'};
  const payload={contentId:CID,revision:1,channel,kind:'post',...(operation==='generate'?{format:'image',brief:'ניהול ועד בית'}:{when:'now',draftDigest:'approved-hash'})};
  const item={id:operation==='generate'?WID:PUB,operation,payload,created:+ctx.at/1000};ctx.remote.requests.push(item);return item.id;
}
function asset(ctx,slot) {
  const bytes=Buffer.alloc(60,1);bytes.set([255,216,255,192,0,17,8],0);bytes.writeUInt16BE(1080,7);bytes.writeUInt16BE(1080,9);
  const path=join(ctx.root,'art.jpg');writeFileSync(path,bytes);
  ctx.queue.saveDraft(slot,{assetPath:path,headline:'ניהול ועד בית',caption:'תכנון ניקוי לבניין',review:{approved:true,hebrewChecked:true,claimsChecked:true,visualChecked:true}},ctx.at);
  const d=ctx.queue.get(slot).draft;
  ctx.queue.markReady(slot,{url:`https://klem.co.il/Pic/instagram/${d.imageHash}.jpg`,sha256:d.imageHash,width:d.width,height:d.height,publicReadVerifiedAt:ctx.at.toISOString()},ctx.at);
  return ctx.queue.get(slot).draft;
}
function identity(ctx) {return {accountId:'17841400000999001',username:'klem.test',accountType:'BUSINESS',canPublish:true,actions:['create_image_post','create_story'],verifiedAt:ctx.at.toISOString()};}
async function generated(ctx) {
  await ctx.bridge.enable();request(ctx);
  const work=await ctx.bridge.prepare(WID);ctx.queue.claimGeneration(work.slotId,ctx.at);asset(ctx,work.slotId);
  await ctx.bridge.report(WID);
  ctx.contents[CID].draft=clone(ctx.finishes.at(-1).result.draft);
  ctx.contents[CID].approval={digest:'approved-hash'};
  return work.slotId;
}

test('configured cadence uses real Israel weekdays and winter time',()=>{
  const c=instagramCadence({feedDays:[1,5],feedTime:'10:15',storyTimes:['18:00','12:00'],timezone:'Asia/Jerusalem'});
  const rows=instagramCalendar('2026-10-25',7,c);
  assert.equal(rows.filter(s=>s.kind==='post').length,2);assert.equal(rows.filter(s=>s.kind==='story').length,14);
  assert.deepEqual(rows.filter(s=>s.kind==='post').map(s=>s.day),['2026-10-26','2026-10-30']);
  assert.throws(()=>instagramCadence({feedDays:[true],feedTime:'09:00',storyTimes:[],timezone:'Asia/Jerusalem'}),/Invalid/);
});
test('schedule changes retime only unattempted rows and preserve missed/claimed/published history',t=>{
  const c=setup(t);c.queue.plan('2026-10-25',7);
  c.store.db.prepare("UPDATE instagram_slots SET status='published',claim='preserved' WHERE id='2026-10-25:feed'").run();
  c.store.db.prepare("UPDATE instagram_slots SET status='missed' WHERE id='2026-10-27:feed'").run();
  c.store.db.prepare("UPDATE instagram_slots SET status='generating' WHERE id='2026-10-29:feed'").run();
  c.store.set('instagram_schedule',{feedDays:[0,2,4],feedTime:'11:00',storyTimes:['15:00'],timezone:'Asia/Jerusalem'});
  c.queue.plan('2026-10-25',7);
  assert.equal(c.queue.get('2026-10-25:feed').claim,'preserved');
  assert.equal(c.queue.get('2026-10-27:feed').status,'missed');
  assert.equal(c.queue.get('2026-10-29:feed').time,'09:00');
  assert.equal(c.queue.isDue(c.queue.get('2026-10-29:feed'),new Date('2026-10-29T07:30:00Z')),false);
  assert.equal(c.queue.get('2026-10-26:story-1').time,'15:00');
});
test('removing and reinstating a future schedule does not revive missed slots',t=>{
  const c=setup(t);c.queue.plan('2026-10-25',7);
  c.store.set('instagram_schedule',{feedDays:[],feedTime:'09:00',storyTimes:[],timezone:'Asia/Jerusalem'});
  c.queue.plan('2026-10-25',7);assert.equal(c.queue.get('2026-10-27:feed').status,'cancelled');
  c.store.set('instagram_schedule',c.remote.settings.schedule);c.queue.plan('2026-10-25',7);
  assert.equal(c.queue.get('2026-10-27:feed').status,'planned');
});
test('bootstrap imports the existing Stop and budgets instead of new defaults',async t=>{
  const c=setup(t);c.remote.changes={};c.store.updatePolicy({paused:true,dailyMinor:12000,monthlyMinor:300000},BASE);
  await c.bridge.enable();
  assert.equal(c.remote.settings.paused,true);assert.equal(c.remote.settings.dailyMinor,12000);
  assert.equal(c.store.policy().paused,true);assert.equal(c.store.policy().dailyMinor,12000);
});
test('cached running state never clears local Stop; a later explicit remote resume can',async t=>{
  const c=setup(t);await c.bridge.enable();c.at=new Date(+BASE+1000);c.store.updatePolicy({paused:true},c.at);
  await c.bridge.sync();assert.equal(c.store.policy().paused,true);
  c.at=new Date(+BASE+2000);c.remote.revision=2;c.remote.changes.resume={revision:2,at:+c.at/1000,sender:'972528310789'};
  await c.bridge.sync();assert.equal(c.store.policy().paused,false);
});
test('stale remote state, a rollback or changed unversioned data blocks the local publisher',async t=>{
  const c=setup(t);await c.bridge.enable();c.at=new Date(+BASE+61000);
  assert.throws(()=>c.queue.claimGeneration('2026-10-25:feed',c.at),/Refresh WhatsApp/);
  assert.throws(()=>c.store.modelCall('facebook-creative',c.at),/Refresh WhatsApp/);
  assert.throws(()=>c.store.reserve('unknown',c.at),/Refresh WhatsApp/);
  c.remote.settings.spec.tone='changed without revision';
  await assert.rejects(c.bridge.sync(),/without a new revision/);
  assert.equal(c.store.get('whatsapp_management').healthy,false);
  assert.throws(()=>c.queue.claimGeneration('2026-10-25:feed',c.at),/Refresh WhatsApp/);
});
test('all channels can be disabled without enabling a fallback publishing route',async t=>{
  const c=setup(t);await c.bridge.enable();c.remote.revision=2;c.remote.settings.channels=[];
  await c.bridge.sync();assert.deepEqual(c.store.policy().channels,[]);
  assert.throws(()=>c.queue.claimGeneration('2026-10-25:feed',c.at),/disabled/);
});
test('changing the schedule cannot revive an already expired old-calendar slot',async t=>{
  const c=setup(t);await c.bridge.enable();
  c.at=new Date('2026-10-25T12:00:00Z');
  c.remote.revision=2;c.remote.settings.schedule.feedTime='16:00';
  await c.bridge.sync();
  assert.equal(c.queue.get('2026-10-25:feed').status,'missed');
  assert.equal(c.queue.get('2026-10-27:feed').time,'16:00');
});
test('lost claim response recovers the same durable attempt and never regenerates',async t=>{
  const c=setup(t);await c.bridge.enable();request(c);c.loseClaim=true;
  await assert.rejects(c.bridge.prepare(WID),/Response lost/);
  const attempt=c.bridge.work(WID).attempt_id;
  const work=await c.bridge.prepare(WID);assert.equal(c.claimsCreated,1);assert.equal(c.bridge.work(WID).attempt_id,attempt);
  c.queue.claimGeneration(work.slotId,c.at);
  await c.bridge.prepare(WID);
  assert.throws(()=>c.queue.claimGeneration(work.slotId,c.at),/already claimed/);
});
test('review mode permits explicit draft creation, but never autonomous publication of that draft',async t=>{
  const c=setup(t);c.store.updatePolicy({mode:'review'},BASE);c.remote.settings.approvalMode='review';
  const slot=await generated(c);
  assert.equal(c.queue.get(slot).status,'ready');
  assert.equal(c.queue.due(c.at).some(s=>s.id===slot),false);
  const qc=new MarketingQualityControl(c.store,{assetRoot:c.root});assert.equal(qc.scan(c.at).work.some(w=>w.slotId===slot),false);
  c.queue.bind(identity(c),c.at);
  assert.throws(()=>c.queue.claimPublish(slot,identity(c),c.at),/due/);
});
test('approved request publishes the existing reviewed asset through the normal native claim gate',async t=>{
  const c=setup(t),slot=await generated(c);request(c,'publish');
  const work=await c.bridge.prepare(PUB);assert.equal(work.slotId,slot);
  c.queue.bind(identity(c),c.at);
  const native=c.queue.claimPublish(slot,identity(c),c.at);
  assert.equal(native.action,'create_image_post');assert.equal(native.params.caption,'תכנון ניקוי לבניין');
  assert.throws(()=>c.queue.claimPublish(slot,identity(c),c.at),/ready/);
  c.queue.finish(slot,native.claim,{verified:true,accountId:identity(c).accountId,mediaId:'18116347280039443'},c.at);
  await c.bridge.report(PUB);await c.bridge.report(PUB);
  assert.equal(c.finishes.filter(f=>f.workId===PUB).length,1);
});
test('managed publication respects the weekly cadence and shares uncertainty with scheduled posts',async t=>{
  const c=setup(t),slot=await generated(c);request(c,'publish');await c.bridge.prepare(PUB);c.queue.bind(identity(c),c.at);
  c.store.db.prepare("UPDATE instagram_slots SET status='uncertain' WHERE id='2026-10-25:feed'").run();
  assert.throws(()=>c.queue.claimPublish(slot,identity(c),c.at),/Reconcile/);
});
test('native uncertainty is reported once and resolved from an existing native receipt',async t=>{
  const c=setup(t),slot=await generated(c);request(c,'publish');await c.bridge.prepare(PUB);c.queue.bind(identity(c),c.at);
  const native=c.queue.claimPublish(slot,identity(c),c.at);
  c.queue.finish(slot,native.claim,{verified:false},c.at);await c.bridge.report(PUB);
  assert.equal(c.bridge.work(PUB).status,'uncertain');
  assert.throws(()=>c.queue.claimPublish(slot,identity(c),c.at),/ready/);
  c.queue.reconcile(slot,{verified:true,accountId:identity(c).accountId,mediaId:'18116347280039443'},c.at);
  await c.bridge.reconcileReport(PUB);
  assert.equal(c.bridge.work(PUB).status,'reported');
  assert.deepEqual(c.finishes.filter(f=>f.workId===PUB).map(f=>f.result.status),['uncertain','completed']);
});
test('unattempted cancellation is terminal locally before its server response and never clears a native claim',async t=>{
  const c=setup(t),slot=await generated(c);request(c,'publish');await c.bridge.prepare(PUB);c.queue.bind(identity(c),c.at);
  const requestOriginal=c.bridge.client.request;let lose=true;
  c.bridge.client.request=async(endpoint,data)=>{
    const result=await requestOriginal(endpoint,data);
    if(endpoint==='/work/finish'&&lose){lose=false;throw new Error('Lost cancellation receipt');}
    return result;
  };
  await assert.rejects(c.bridge.cancelUnattempted(PUB,'Stopped before the native action'),/Lost/);
  assert.equal(c.queue.get(slot).status,'cancelled');
  assert.equal(c.queue.get(slot).claim,null);
  assert.throws(()=>c.queue.claimPublish(slot,identity(c),c.at),/authorization|ready/i);
  c.at=new Date(+c.at+120000);
  await c.bridge.cancelUnattempted(PUB,'Stopped before the native action');
  assert.deepEqual(c.finishes.at(-1).result,c.finishes.at(-2).result);
  // Separate synthetic attempted row: its outcome must still be reconciled.
  c.store.db.prepare("UPDATE instagram_slots SET status='uncertain',claim='existing-native-claim' WHERE id=?").run(slot);
  assert.throws(()=>c.queue.cancelManagedUnattempted(slot,PUB,c.at),/Cannot cancel/);
});
test('approval cannot silently change caption or image bytes',async t=>{
  const c=setup(t);await generated(c);c.contents[CID].draft.caption='Different';request(c,'publish');
  await assert.rejects(c.bridge.prepare(PUB),/differs from the reviewed/);
});
test('remote action authorization expires even when global settings are fresh',async t=>{
  const c=setup(t);await c.bridge.enable();request(c);const work=await c.bridge.prepare(WID);
  c.at=new Date(+BASE+61000);await c.bridge.sync();
  assert.throws(()=>c.queue.claimGeneration(work.slotId,c.at),/Fresh authorization/);
  await c.bridge.authorize(WID);assert.equal(c.queue.claimGeneration(work.slotId,c.at).status,'generating');
});
test('video/provider requests stay queued while their route is unfinished',async t=>{
  const c=setup(t);await c.bridge.enable();request(c);c.remote.requests[0].payload.format='video';
  await assert.rejects(c.bridge.prepare(WID),/not connected/);assert.equal(c.claimsCreated,0);
});
test('cancelled or revised WhatsApp content retires local unattempted drafts without touching native attempts',async t=>{
  const c=setup(t),slot=await generated(c);
  c.remote.contentStates=[{id:CID,revision:2,status:'queued'}];
  await c.bridge.sync();assert.equal(c.queue.get(slot).status,'cancelled');
  c.store.db.prepare("UPDATE instagram_slots SET status='uncertain',claim='native-claim' WHERE id=?").run(slot);
  await c.bridge.sync();assert.equal(c.queue.get(slot).status,'uncertain');
  assert.equal(c.queue.get(slot).claim,'native-claim');
});
test('worker client signs exact method/path/body and rejects redirects and arbitrary endpoints',async()=>{
  const key='k'.repeat(40),seen=[];
  const client=new ManagementClient({key,now:()=>BASE,fetcher:async(url,options)=>{seen.push({url,options});return new Response('{"saved":true}',{headers:{'Content-Type':'application/json'}});}});
  const payload={revision:2,observed:{ready:true}};await client.request('/observed',payload);
  const {options,url}=seen[0];assert.equal(options.redirect,'error');assert.equal(options.method,'POST');
  assert.equal(url,'https://lie-3r9p.onrender.com/internal/klem-management/observed');
  const stamp=String(Math.floor(+BASE/1000)),signed=stamp+'\nPOST\n/internal/klem-management/observed\n'+JSON.stringify(payload);
  assert.equal(options.headers['x-klem-signature'],'sha256='+createHmac('sha256',key).update(signed).digest('hex'));
  await assert.rejects(client.request('https://evil.example'),/Unsupported/);
});

test('quality control sends reviewed calendar content to approval and never grants publication in review mode',async t=>{
  const c=setup(t);c.remote.settings.approvalMode='review';await c.bridge.enable();
  const qc=new MarketingQualityControl(c.store,{assetRoot:c.root});
  let work=qc.scan(c.at).work.find(w=>w.slotId==='2026-10-25:feed');
  assert.equal(work.action,'run_content_workflow');assert.equal(work.mayPublish,false);
  c.queue.claimGeneration(work.slotId,c.at);asset(c,work.slotId);
  work=qc.scan(c.at).work.find(w=>w.slotId==='2026-10-25:feed');
  assert.equal(work.action,'offer_scheduled_draft_for_approval');assert.equal(work.mayPublish,false);
  c.store.db.prepare("UPDATE instagram_slots SET status='awaiting_review' WHERE id=?").run(work.slotId);
  work=qc.scan(c.at).work.find(w=>w.slotId==='2026-10-25:feed');
  assert.equal(work.action,'recover_same_scheduled_draft');assert.equal(work.mayPublish,false);
});

test('worker scan separates queued work, uncertain native results and stopped execution',async t=>{
  const c=setup(t);await c.bridge.enable();request(c);
  let scan=await c.bridge.scan();
  assert.ok(scan.work.some(w=>w.workId===WID&&w.action==='prepare_confirmed_request'));
  const prepared=await c.bridge.prepare(WID);
  scan=await c.bridge.scan();
  assert.ok(scan.work.some(w=>w.workId===WID&&w.action==='generate_requested_content'));
  c.queue.claimGeneration(prepared.slotId,c.at);asset(c,prepared.slotId);await c.bridge.report(WID);
  c.contents[CID].draft=clone(c.finishes.at(-1).result.draft);c.contents[CID].approval={digest:'approved-hash'};
  request(c,'publish');await c.bridge.prepare(PUB);const ident=identity(c);c.queue.bind(ident,c.at);
  c.queue.claimPublish(prepared.slotId,ident,c.at);
  c.remote.revision++;c.remote.settings.paused=true;
  scan=await c.bridge.scan();
  assert.equal(scan.paused,true);
  assert.ok(scan.work.some(w=>w.workId===PUB&&w.action==='reconcile_native_media'));
  assert.ok(!scan.work.some(w=>w.mayPublish));
});

test('library exports all history beyond operational limits without paths, claims or settings changes',async t=>{
  const c=setup(t),q=c.queue;
  for(let i=0;i<110;i++)c.store.db.prepare('INSERT INTO instagram_slots(id,day,time,kind,status,brief,claim) VALUES(?,?,?,?,?,?,?)').run(`2026-10-24:archive-${i}`,'2026-10-24','13:00','story','planned',JSON.stringify({pillar:'quote-checklist',brief:'private generation instructions'}),'private-claim');
  const before=c.store.policy();
  assert.equal(q.list().length,93);
  const entries=c.bridge.libraryEntries();
  assert.equal(entries.length,110);
  assert.equal(entries[0].scheduledAt,'2026-10-24T13:00:00+03:00');
  assert.ok(!JSON.stringify(entries).includes('private-claim'));
  assert.ok(!JSON.stringify(entries).includes('private generation instructions'));
  const synced=await c.bridge.syncLibrary();
  assert.equal(synced.saved,110);
  assert.equal(c.calls.length,11);
  assert.ok(c.calls.every(call=>call.endpoint==='/library'&&call.data.entries.length<=10));
  assert.deepEqual(c.store.policy(),before);
  assert.equal(c.store.db.prepare('SELECT count(*) n FROM instagram_slots').get().n,110);
});


test('unconfigured social channels cannot consume generation work or report ready',async t=>{
  const c=setup(t);await c.bridge.enable();request(c,'generate','facebook');
  await assert.rejects(c.bridge.prepare(WID),/not connected/);assert.equal(c.claimsCreated,0);
  const saved={...SOCIAL_ACCOUNTS.instagram};
  try {SOCIAL_ACCOUNTS.instagram.accountId=null;
    assert.equal(c.bridge.snapshot().ready,false);
    assert.throws(()=>c.queue.claimGeneration('2026-10-25:feed',c.at),/not connected/);
  } finally {Object.assign(SOCIAL_ACCOUNTS.instagram,saved);}
});
test('Facebook uses its own binding, photo action and Page-scoped receipt',async t=>{
  const original={...SOCIAL_ACCOUNTS.facebook};
  Object.assign(SOCIAL_ACCOUNTS.facebook,{accountId:'100069860425523',username:'Klem test'});
  t.after(()=>Object.assign(SOCIAL_ACCOUNTS.facebook,original));
  const c=setup(t);await c.bridge.enable();request(c,'generate','facebook');
  const work=await c.bridge.prepare(WID),slot=work.slotId;
  c.queue.claimGeneration(slot,c.at);asset(c,slot);await c.bridge.report(WID);
  c.contents[CID].draft=clone(c.finishes.at(-1).result.draft);c.contents[CID].approval={digest:'approved-hash'};
  request(c,'publish','facebook');await c.bridge.prepare(PUB);
  const fb={channel:'facebook',accountId:'100069860425523',username:'Klem test',verifiedAt:c.at.toISOString(),canPublish:true,actions:['create_photo_post']};
  assert.throws(()=>c.queue.bind({...fb,accountId:'1369916819542873'},c.at),/exact Klem/);
  c.queue.bind(fb,c.at);assert.throws(()=>c.queue.claimPublish(slot,identity(c),c.at),/Klem publishing/);
  const native=c.queue.claimPublish(slot,fb,c.at);
  assert.equal(native.connector,'facebook_organic');assert.equal(native.action,'create_photo_post');
  assert.deepEqual(Object.keys(native.params).sort(),['caption','image_url']);
  c.queue.finish(slot,native.claim,{verified:true,accountId:fb.accountId,mediaId:'1369916819542873_123456789'},c.at);
  assert.equal(c.queue.get(slot).status,'uncertain');
  assert.throws(()=>c.queue.claimPublish(slot,fb,c.at),/ready/);
  c.queue.reconcile(slot,{verified:true,accountId:fb.accountId,mediaId:fb.accountId+'_123456789'},c.at);
  await c.bridge.report(PUB);assert.equal(c.finishes.at(-1).result.status,'completed');
});
