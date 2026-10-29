import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {BRAND,israelDay,validatePolicy,socialIdentity} from './config.mjs';
import {InstagramQueue,instagramCadence} from './instagram.mjs';
import {signature,HOST} from '../../scripts/klem-marketing-client.mjs';
import {videoReady} from './video-agent.mjs';
import {MarketingQualityControl} from './quality-control.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const id=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
function canonical(value) {
  const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
  return JSON.stringify(ordered(value));
}
const same=(a,b)=>canonical(a)===canonical(b);
const clone=value=>structuredClone(value);
export class ManagementClient {
  constructor({key,fetcher=fetch,now=()=>new Date()}={}) {this.key=key;this.fetcher=fetcher;this.now=now;}
  async request(endpoint,data=null) {
    if(!['/state','/bootstrap','/observed','/library','/scheduled-draft','/work/claim','/work/authorize','/work/finish'].includes(endpoint))throw new Error('Unsupported management endpoint');
    if(typeof this.key!=='string'||this.key.length<32)throw new Error('Existing management integration key is required');
    const path='/internal/klem-management'+endpoint,method=data===null?'GET':'POST',bytes=data===null?Buffer.alloc(0):Buffer.from(JSON.stringify(data));
    const response=await this.fetcher(HOST+path,{method,redirect:'error',headers:{...signature(this.key,method,path,bytes,+this.now()),'Content-Type':'application/json'},...(data===null?{}:{body:bytes}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`Management request failed: HTTP ${response.status}`);
    const value=await response.text();
    if(Buffer.byteLength(value)>1_000_000)throw new Error('Management response exceeded its limit');
    return JSON.parse(value);
  }
}

export function validateSettings(settings) {
  if(!settings||typeof settings!=='object'||Array.isArray(settings)||Object.keys(settings).sort().join(',')!=='approvalMode,channels,dailyMinor,monthlyMinor,paused,schedule,spec')throw new Error('Invalid management settings');
  instagramCadence(settings.schedule);
  if(!settings.spec||Object.keys(settings.spec).sort().join(',')!=='audience,language,objective,tone,topics'||Object.values(settings.spec).some(v=>typeof v!=='string'||!v.trim()||v.length>2000))throw new Error('Invalid marketing brief');
  if(!['autonomous','review'].includes(settings.approvalMode)||typeof settings.paused!=='boolean')throw new Error('Invalid management operating mode');
  if(!Number.isSafeInteger(settings.dailyMinor)||!Number.isSafeInteger(settings.monthlyMinor))throw new Error('Budget ceilings must be explicit integers');
  return settings;
}

export class ManagementBridge {
  constructor(store,{client,now=()=>new Date(),assetRoot}={}) {
    this.store=store;this.db=store.db;this.client=client;this.now=now;this.queue=new InstagramQueue(store,assetRoot?{assetRoot}:{});
    this.db.exec(`CREATE TABLE IF NOT EXISTS whatsapp_management_work (
      id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, status TEXT NOT NULL,
      server_claim TEXT, slot_id TEXT, result TEXT, error TEXT);
      CREATE TABLE IF NOT EXISTS whatsapp_scheduled_drafts (
        slot_id TEXT PRIMARY KEY, payload TEXT NOT NULL, response TEXT, status TEXT NOT NULL);`);
  }
  work(wid) {
    const row=this.db.prepare('SELECT * FROM whatsapp_management_work WHERE id=?').get(wid);
    return row?{...row,server_claim:row.server_claim?JSON.parse(row.server_claim):null,result:row.result?JSON.parse(row.result):null}:null;
  }
  existingSettings() {
    const policy=this.store.policy(),cadence=this.queue.cadence(),feed=cadence.slots.find(s=>s.kind==='post');
    return {schedule:{feedDays:feed?.weekdays||[],feedTime:feed?.time||'09:00',storyTimes:cadence.slots.filter(s=>s.kind==='story').map(s=>s.time),timezone:'Asia/Jerusalem'},
      paused:policy.paused,approvalMode:policy.mode==='review'||this.store.get('instagram_approval_policy')?.ownerApprovalRequiredNow===true?'review':'autonomous',
      channels:policy.channels,dailyMinor:policy.dailyMinor,monthlyMinor:policy.monthlyMinor,
      spec:this.store.get('marketing_spec')||{objective:'Qualified leads and bookings',audience:BRAND.audience.join('; '),language:BRAND.language,tone:'Clear, practical and trustworthy',topics:BRAND.services.join('; ')}};
  }
  async enable() {
    if(!this.store.get('whatsapp_management')?.enabled) {
      const current=this.store.get('whatsapp_management');
      this.store.set('whatsapp_management',{...current,enabled:true,healthy:false,workerId:current?.workerId||randomBytes(16).toString('hex')});
    }
    return this.sync({bootstrap:true});
  }
  fail(error) {
    const control=this.store.get('whatsapp_management');
    this.store.set('whatsapp_management',{...control,healthy:false,lastError:error.message,failedAt:this.now().toISOString()});
  }
  async sync({bootstrap=false}={}) {
    const control=this.store.get('whatsapp_management');
    if(!control?.enabled)return {enabled:false,changed:false};
    try {
      let remote=await this.client.request('/state');
      if(bootstrap&&!remote.changes?.bootstrap) {
        const settings=validateSettings(this.existingSettings());
        await this.client.request('/bootstrap',{settings});
        remote=await this.client.request('/state');
      }
      if(!remote.changes?.bootstrap)throw new Error('Import the existing manager settings before enabling remote management');
      const result=this.apply(remote);
      const observed=this.snapshot();
      await this.client.request('/observed',{revision:remote.revision,observed});
      await this.syncLibrary();
      return {...result,remote,observed};
    } catch(error) {this.fail(error);throw error;}
  }
  apply(remote) {
    const settings=validateSettings(remote.settings),control=this.store.get('whatsapp_management');
    if(!control?.enabled||!Number.isSafeInteger(remote.revision)||remote.revision<1||remote.revision<(control.revision||0))throw new Error('Invalid or older management revision');
    if(control.revision===remote.revision&&control.settings&&!same(control.settings,settings))throw new Error('Management settings changed without a new revision');
    const policy=this.store.policy(),changed=control.revision!==remote.revision;
    // A cached remote 'running' flag cannot clear a newer local emergency Stop.
    const resume=remote.changes?.resume;
    const localStop=this.db.prepare("SELECT at FROM audit WHERE event='policy_updated' AND json_extract(details,'$.paused')=1 ORDER BY id DESC LIMIT 1").get();
    const freshResume=resume&&resume.revision>(control.revision||0)&&Number(resume.at)*1000>(localStop?Date.parse(localStop.at):0);
    const paused=settings.paused||(policy.paused&&!freshResume);
    const desired=validatePolicy({...policy,mode:settings.approvalMode,paused,dailyMinor:settings.dailyMinor,monthlyMinor:settings.monthlyMinor,channels:settings.channels});
    const policyChanged=!same(desired,policy);
    // Expired old-calendar slots stay missed even if the new cadence has a
    // later time today. A schedule update is not an implicit catch-up request.
    this.queue.markMissed(this.now());
    this.store.transaction(()=>{
      if(policyChanged) {
        desired.version=policy.version+1;
        this.store.set('policy',desired);this.store.audit('policy_updated',desired,this.now());
      }
      this.store.set('instagram_schedule',settings.schedule);
      this.store.set('marketing_spec',settings.spec);
      this.store.set('instagram_approval_policy',{ownerApprovalRequiredNow:settings.approvalMode==='review',source:'whatsapp_management',revision:remote.revision});
      this.store.set('whatsapp_management',{...control,healthy:true,revision:remote.revision,settings:clone(settings),checkedAt:this.now().toISOString(),lastError:null});
      if(changed)this.store.audit('whatsapp_settings_applied',{revision:remote.revision,paused,requestedPaused:settings.paused,policyChanged},this.now());
    });
    this.queue.plan(israelDay(this.now()),7);
    this.queue.retireManaged(remote.contentStates,this.now());
    return {enabled:true,revision:remote.revision,changed,localStopped:paused};
  }
  snapshot() {
    const control=this.store.get('whatsapp_management'),age=+this.now()-Date.parse(control?.checkedAt);
    const configuredRoutes=['instagram','facebook'].filter(c=>socialIdentity(c));
    return {ready:configuredRoutes.length>0&&control?.enabled===true&&control.healthy===true&&Number.isFinite(age)&&age>=0&&age<=60000,localExecution:true,paused:this.store.policy().paused,cadence:this.queue.cadence(),
      contentRequests:this.db.prepare('SELECT id,status,slot_id FROM whatsapp_management_work ORDER BY rowid DESC LIMIT 30').all(),
      slots:this.queue.list().slice(0,30).map(s=>({id:s.id,day:s.day,time:s.time,kind:s.kind,status:s.status,mediaId:s.receipt?.mediaId||null})),
      qualityControl:this.store.get('marketing_quality_control')?.counts||null,
      workBlockers:this.store.get('whatsapp_work_blockers')||[],
      capabilities:{imageRoutes:configuredRoutes,videoReady:videoReady(this.store,this.now()),callsReady:false},
      limitation:'Publishing executes while the Mac and Codex are available. Saved requests are not proof of publication.'};
  }
  libraryEntries() {
    // Deliberately bypass the operational queue's recent-93 limit. This archive
    // contains every ledger row, but never private paths, prompts or claims.
    return this.db.prepare('SELECT id FROM instagram_slots ORDER BY day,id').all().map(({id})=>{
      const s=this.queue.get(id),d=s.draft,r=s.receipt,b=s.brief||{},mapping=this.queue.managed(id);
      const date=new Date(s.day+'T12:00:00Z');
      const offset=new Intl.DateTimeFormat('en',{timeZone:'Asia/Jerusalem',timeZoneName:'longOffset'}).formatToParts(date).find(p=>p.type==='timeZoneName').value.replace('GMT','')||'+00:00';
      const scheduledAt=`${s.day}T${s.time}:00${offset}`;
      const publicAsset=d?.publicURL&&d.review?.approved&&d.review.hebrewChecked&&d.review.claimsChecked&&d.review.visualChecked;
      const format=d?.format==='mp4'||b.format==='video'?'video':'image';
      const receiptAt=r?.verifiedAt||this.db.prepare("SELECT at FROM audit WHERE event IN ('instagram_published','instagram_reconciled') AND json_extract(details,'$.id')=? ORDER BY id DESC LIMIT 1").get(s.id)?.at;
      const native=r?.verified&&r.accountId===socialIdentity(this.queue.channel(s.id))?.accountId&&receiptAt?r:null;
      const readback=native?.nativeReadback?.data?.find(row=>String(row.media_id||row.story_id)===String(native.mediaId));
      const nativeTime=readback?.timestamp||readback?.story_timestamp;
      const publishedAt=native?(nativeTime&&Number.isFinite(Date.parse(nativeTime))?new Date(nativeTime).toISOString():receiptAt):null;
      // A local status without a verified native receipt is not proof of publication.
      const status=s.status==='published'&&!native?'uncertain':s.status;
      const titles={'maintenance':'תכנון תחזוקת הבניין','committee':'ניהול שוטף של ועד הבית','supplier':'תיאום ופיקוח על ספקים','reporting':'דיווח ומעקב אחר תחזוקה','handover':'היערכות להחלפת חברת ניהול','service-area':'שירותי Klem במרכז ובשפלה'};
      return {id:s.id,scheduledAt,createdAt:d?.createdAt||null,publishedAt:publishedAt||null,
        kind:b.requestedKind||s.kind,format,status,brief:String(d?.headline||titles[b.pillar]||'תוכן Klem').slice(0,2000),
        draft:publicAsset?{caption:s.kind==='story'?'':d.caption||'',assets:[{sha256:d.imageHash,url:d.publicURL}],review:{hebrew:true,claims:true,visual:true}}:null,
        publication:native?{mediaId:String(native.mediaId),permalink:native.permalink||null,verifiedAt:receiptAt}:null,
        contentId:mapping?.content_id||b.contentId||null};
    });
  }
  async syncLibrary() {
    // Read-only with respect to all publication/settings/work ledgers. Safe to
    // run explicitly while the scheduled worker and supervisor are paused.
    const entries=this.libraryEntries();
    let saved=0;
    for(let offset=0;offset<entries.length;offset+=10) {
      const batch=entries.slice(offset,offset+10);
      const result=await this.client.request('/library',{checkedAt:this.now().toISOString(),entries:batch});
      if(result.saved!==batch.length)throw new Error('Library synchronization was not acknowledged');
      saved+=result.saved;
    }
    return {saved,published:entries.filter(e=>e.status==='published').length,planned:entries.filter(e=>e.status==='planned').length};
  }
  async scan() {
    const {remote}=await this.sync();
    if(!remote)return {enabled:false,work:[]};
    const now=this.now(),work=[],blocked=[];
    const policy=this.store.policy(),canRun=!policy.paused;
    for(const request of remote.requests||[]) {
      if(request.operation==='publish') {
        const due=request.payload.when==='now'?request.created*1000:Date.parse(request.payload.when);
        if(!Number.isFinite(due)||+now<due||+now>=due+3*3600000||israelDay(new Date(due))!==israelDay(now))continue;
      }
      if(!socialIdentity(request.payload.channel)||!policy.channels.includes(request.payload.channel)) {blocked.push({workId:request.id,reason:'Publishing for this channel is not connected yet'});continue;}
      if(request.operation==='generate'&&request.payload.format==='video'&&!videoReady(this.store,now)) {
        work.push({workId:request.id,action:'verify_video_readiness',mayPublish:false});continue;
      }
      if(canRun)work.push({workId:request.id,action:'prepare_confirmed_request',mayPublish:false});
    }
    for(const row of this.db.prepare("SELECT id FROM whatsapp_management_work WHERE status!='reported'").all()) {
      const local=this.work(row.id),slot=local.slot_id?this.queue.get(local.slot_id):null;
      let action;
      if(local.status==='cancelled_local')action='report_same_local_cancellation';
      else if(local.result)action='report_saved_result';
      else if(!slot)action='recover_same_work_claim';
      else if(['publishing','uncertain'].includes(slot.status))action='reconcile_native_media';
      else if(slot.status==='published')action='report_verified_publication';
      else if(slot.status==='rejected')action='report_rejected_generation';
      else if(local.server_claim.operation==='publish')action=this.queue.isDue(slot,now)?'refresh_checks_then_publish_approved_media':'cancel_expired_unattempted_publication';
      else action=slot.status==='planned'?'generate_requested_content':slot.status==='generating'?'inspect_existing_generation':'upload_and_report_reviewed_draft';
      if(canRun||['report_same_local_cancellation','report_saved_result','reconcile_native_media','report_verified_publication','report_rejected_generation','cancel_expired_unattempted_publication'].includes(action))
        work.push({workId:local.id,slotId:slot?.id,action,mayPublish:action==='refresh_checks_then_publish_approved_media'});
    }
    this.store.set('whatsapp_work_blockers',blocked);
    const qc=new MarketingQualityControl(this.store,{assetRoot:this.queue.assetRoot});
    for(const item of blocked)qc.observe('management:'+item.workId,null,'management_route_unavailable','needs_attention',item,now);
    const stillBlocked=new Set(blocked.map(item=>'management:'+item.workId));
    const activeRequests=new Set([...(remote.requests||[]),...(remote.unresolved||[])].map(item=>item.id));
    for(const incident of qc.incidents().filter(i=>i.type==='management_route_unavailable'&&i.state==='needs_attention')) {
      if(!stillBlocked.has(incident.id)&&!activeRequests.has(incident.details.workId))
        qc.observe(incident.id,null,'management_request_closed','resolved',{workId:incident.details.workId},now);
    }
    const scan=qc.scan(now);
    // A due calendar row or an unconfirmed handoff remains owned by the same
    // ledger, even when it is recovered by this worker.
    work.push(...scan.work);
    await this.client.request('/observed',{revision:remote.revision,observed:this.snapshot()});
    return {enabled:true,paused:policy.paused,checkedAt:now.toISOString(),work,blocked,notifications:scan.notifications};
  }
  async offerSlot(slotId) {
    await this.sync();
    let handoff=this.db.prepare('SELECT * FROM whatsapp_scheduled_drafts WHERE slot_id=?').get(slotId);
    if(handoff?.status==='imported')return JSON.parse(handoff.response);
    if(!handoff) {
      const slot=this.queue.get(slotId),control=this.store.get('whatsapp_management');
      if(!control?.enabled||control.settings.approvalMode!=='review'||this.store.policy().paused||!this.store.policy().channels.includes('instagram'))throw new Error('Scheduled review is not enabled');
      if(!slot||slot.status!=='ready'||!this.queue.isDue(slot,this.now())||this.queue.managed(slotId)||this.queue.manualBatch(slotId)||slot.claim)throw new Error('Only a reviewed, unattempted due calendar slot can enter approval');
      const age=+this.now()-Date.parse(slot.draft?.publicReadVerifiedAt);
      if(!Number.isFinite(age)||age<0||age>3600000||digest(readFileSync(slot.draft.assetPath))!==slot.draft.imageHash)throw new Error('Refresh the reviewed public media before handing it to WhatsApp');
      const payload={slotId,time:slot.time,kind:slot.kind,brief:slot.draft.headline,draft:{caption:slot.draft.caption,headline:slot.draft.headline,
        assets:[{sha256:slot.draft.imageHash,url:slot.draft.publicURL}],review:{hebrew:true,claims:true,visual:true}},settingsRevision:control.revision};
      this.store.transaction(()=>{
        if(this.queue.get(slotId).status!=='ready')throw new Error('Calendar slot changed before handoff');
        this.db.prepare('INSERT INTO whatsapp_scheduled_drafts(slot_id,payload,status) VALUES(?,?,?)').run(slotId,JSON.stringify(payload),'pending');
        // Freeze before the request. An unknown response must never leave the
        // original slot eligible for autonomous publication or regeneration.
        this.db.prepare("UPDATE instagram_slots SET status='awaiting_review' WHERE id=?").run(slotId);
        this.store.audit('instagram_scheduled_review_requested',{slotId,revision:control.revision},this.now());
      });
      handoff=this.db.prepare('SELECT * FROM whatsapp_scheduled_drafts WHERE slot_id=?').get(slotId);
    }
    const payload=JSON.parse(handoff.payload),response=await this.client.request('/scheduled-draft',payload);
    if(!id(response.contentId)||response.workId!==response.contentId||response.revision!==1||response.origin?.kind!=='scheduled'||response.origin.slotId!==slotId||response.origin.settingsRevision!==payload.settingsRevision||!Number.isFinite(Date.parse(response.origin.scheduledAt)))throw new Error('Invalid scheduled draft acknowledgement');
    const managedId=`managed:${response.contentId}:v1`,starts=new Date(response.origin.scheduledAt);
    this.store.transaction(()=>{
      const slot=this.queue.get(slotId);
      if(slot.status!=='awaiting_review'||slot.claim||this.queue.get(managedId))throw new Error('Scheduled draft handoff state changed; reconcile its existing identity');
      this.db.prepare('INSERT INTO instagram_slots(id,day,time,kind,status,brief,draft) VALUES(?,?,?,?,?,?,?)')
        .run(managedId,slot.day,slot.time,slot.kind,'ready',JSON.stringify({management:true,scheduledSlotId:slotId,contentId:response.contentId,revision:1,brief:payload.brief}),JSON.stringify(slot.draft));
      this.db.prepare('INSERT INTO instagram_management_slots(slot_id,content_id,revision,work_id,operation,starts,expires) VALUES(?,?,?,?,?,?,?)')
        .run(managedId,response.contentId,1,response.workId,'generate',starts.toISOString(),new Date(+starts+48*3600000).toISOString());
      this.db.prepare("UPDATE instagram_slots SET status='delegated' WHERE id=?").run(slotId);
      this.db.prepare("UPDATE whatsapp_scheduled_drafts SET response=?,status='imported' WHERE slot_id=?").run(JSON.stringify(response),slotId);
      this.store.audit('instagram_scheduled_review_imported',{slotId,managedId,contentId:response.contentId},this.now());
    });
    return response;
  }
  async prepare(wid) {
    if(!id(wid))throw new Error('Invalid work ID');
    const {remote}=await this.sync();
    if(!remote)throw new Error('Enable the management connection first');
    const existing=this.work(wid),request=remote.requests?.find(w=>w.id===wid);
    if(!existing&&!request)throw new Error('Work is not queued or known locally');
    if(request&&(!socialIdentity(request.payload?.channel)||request.payload?.channel==='facebook'&&(request.payload.kind!=='post'||request.operation==='generate'&&request.payload.format!=='image')||(request.operation==='generate'&&request.payload.format!=='image'&&!(request.payload.format==='video'&&videoReady(this.store,this.now())))||!['post','story','reel'].includes(request.payload.kind)))throw new Error('The requested provider/media route is not connected yet; work remains queued');
    if(request?.operation==='publish') {
      const due=request.payload.when==='now'?request.created*1000:Date.parse(request.payload.when);
      if(!Number.isFinite(due)||+this.now()<due||+this.now()>=due+3*3600000||israelDay(new Date(due))!==israelDay(this.now()))throw new Error('Publication is outside its current-day window');
    }
    if(!existing)this.db.prepare('INSERT INTO whatsapp_management_work(id,attempt_id,status) VALUES(?,?,?)').run(wid,randomBytes(16).toString('hex'),'requesting');
    let work=this.work(wid);
    if(work.status==='reported')return this.describe(work);
    if(!work.server_claim) {
      // This response can be recovered with the exact persisted attempt ID.
      // It is not a retry of any image generation or native publication action.
      const claim=await this.client.request('/work/claim',{workId:wid,workerId:this.store.get('whatsapp_management').workerId,attemptId:work.attempt_id});
      if(claim.id!==wid||typeof claim.claim!=='string'||!claim.claim)throw new Error('Invalid server work claim');
      this.db.prepare("UPDATE whatsapp_management_work SET status='claimed',server_claim=? WHERE id=?").run(JSON.stringify(claim),wid);
      work=this.work(wid);
    }
    const slot=this.queue.registerManaged(work.server_claim,this.now());
    this.db.prepare('UPDATE whatsapp_management_work SET slot_id=? WHERE id=?').run(slot.id,wid);
    await this.authorize(wid,{sync:false});
    return this.describe(this.work(wid));
  }
  describe(work) {
    return {id:work.id,status:work.status,slotId:work.slot_id,operation:work.server_claim?.operation,
      slot:work.slot_id?this.queue.get(work.slot_id):null};
  }
  async authorize(wid,{sync=true}={}) {
    if(sync)await this.sync();
    const work=this.work(wid);
    if(!work?.server_claim||!work.slot_id)throw new Error('Prepare the durable work claim first');
    const grant=await this.client.request('/work/authorize',{workId:wid,claim:work.server_claim.claim});
    this.queue.authorizeManaged(work.slot_id,grant,this.now());
    return {authorized:true,workId:wid,slotId:work.slot_id,checkedAt:grant.checkedAt};
  }
  async report(wid) {
    const work=this.work(wid);
    if(!work?.server_claim||!work.slot_id)throw new Error('Unknown prepared work');
    if(work.status==='reported')return {reported:true,workId:wid};
    const slot=this.queue.get(work.slot_id),operation=work.server_claim.operation;
    let result=work.result;
    if(!result) {
      if(operation==='generate') {
        if(slot.status==='rejected')result={status:'failed',reason:slot.error};
        else {
          if(!['draft','ready'].includes(slot.status)||!slot.draft?.publicURL)throw new Error('Review and verify the public media before reporting generation');
          if(digest(readFileSync(slot.draft.assetPath))!==slot.draft.imageHash)throw new Error('Reviewed bytes changed');
          result={status:'completed',draft:{caption:slot.draft.caption,headline:slot.draft.headline,
            assets:[{sha256:slot.draft.imageHash,url:slot.draft.publicURL}],review:{hebrew:true,claims:true,visual:true}}};
        }
      } else {
        if(slot.status==='published'&&slot.receipt?.verified===true)result={status:'completed',receipt:slot.receipt};
        else if(['publishing','uncertain'].includes(slot.status))result={status:'uncertain',reason:'Native publication has not been verified; reconcile this existing attempt without repeating the action.'};
        else throw new Error('There is no native publication attempt to report');
      }
      this.db.prepare('UPDATE whatsapp_management_work SET result=? WHERE id=?').run(JSON.stringify(result),wid);
    }
    const receipt=await this.client.request('/work/finish',{workId:wid,claim:work.server_claim.claim,result});
    if(!same(receipt,result))throw new Error('Management result acknowledgement differs from the sent result');
    this.db.prepare("UPDATE whatsapp_management_work SET status=?,error=NULL WHERE id=?").run(result.status==='uncertain'?'uncertain':'reported',wid);
    this.store.audit('whatsapp_work_reported',{workId:wid,slotId:slot.id,status:result.status},this.now());
    return {reported:true,workId:wid,status:result.status};
  }
  async reconcileReport(wid) {
    const work=this.work(wid),slot=work?.slot_id?this.queue.get(work.slot_id):null;
    if(work?.status!=='uncertain'||slot?.status!=='published'||slot.receipt?.verified!==true)throw new Error('Reconcile the existing native media in the local ledger first');
    this.db.prepare('UPDATE whatsapp_management_work SET result=NULL WHERE id=?').run(wid);
    return this.report(wid);
  }
  async cancelUnattempted(wid,reason) {
    const work=this.work(wid);
    if(!work?.slot_id||work.server_claim?.operation!=='publish'||!['claimed','cancelled_local'].includes(work.status))throw new Error('No known unattempted publication is available');
    if(typeof reason!=='string'||!reason.trim()||reason.length>1000)throw new Error('A cancellation reason is required');
    // Terminal local cancellation is committed before notifying the server.
    // A lost response cannot leave an executable native claim behind.
    let result=work.result;
    const remote=await this.client.request('/state');
    if(!result||remote.unresolved?.some(r=>r.id===wid&&r.status==='claimed')) {
      const proof=this.queue.cancelManagedUnattempted(work.slot_id,wid,this.now());
      result={status:'not_attempted',reason,proof};
    }
    this.db.prepare("UPDATE whatsapp_management_work SET status='cancelled_local',result=? WHERE id=?").run(JSON.stringify(result),wid);
    const saved=await this.client.request('/work/finish',{workId:wid,claim:work.server_claim.claim,result});
    if(!same(saved,result))throw new Error('Cancellation acknowledgement differs');
    this.db.prepare("UPDATE whatsapp_management_work SET status='reported' WHERE id=?").run(wid);
    return {workId:wid,status:'not_attempted'};
  }
}
