import {createHash, randomUUID} from 'node:crypto';
import {readFileSync, realpathSync} from 'node:fs';
import {resolve, sep} from 'node:path';
import {israelDay,socialIdentity} from './config.mjs';
import {requireManagementControl,requireWorkAuthorization} from './management-control.mjs';
import {inspectMP4} from './video-media.mjs';

export const INSTAGRAM_CADENCE = {
  username:null, timezone:'Asia/Jerusalem', feedPerDay:1, feedPerWeek:3, storiesPerDay:1,
  slots:[{name:'feed',kind:'post',time:'09:00',weekdays:[0,2,4]},{name:'story-1',kind:'story',time:'13:00'}],
  maxLatenessMinutes:180, maxUnpublishedDrafts:21,
};
export function instagramCadence(schedule) {
  if(schedule==null)return structuredClone(INSTAGRAM_CADENCE);
  if(!schedule||Object.keys(schedule).sort().join(',')!=='feedDays,feedTime,storyTimes,timezone'||schedule.timezone!=='Asia/Jerusalem')throw new Error('Invalid Instagram schedule');
  const {feedDays,feedTime,storyTimes}=schedule;
  const clock=t=>typeof t==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t);
  if(!Array.isArray(feedDays)||feedDays.length>7||feedDays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(feedDays).size!==feedDays.length||!clock(feedTime)||!Array.isArray(storyTimes)||storyTimes.length>3||storyTimes.some(t=>!clock(t))||new Set(storyTimes).size!==storyTimes.length)throw new Error('Invalid Instagram schedule');
  return {...structuredClone(INSTAGRAM_CADENCE),feedPerWeek:feedDays.length,storiesPerDay:storyTimes.length,
    slots:[...(feedDays.length?[{name:'feed',kind:'post',time:feedTime,weekdays:[...feedDays].sort()}]:[]),
      ...[...storyTimes].sort().map((time,i)=>({name:`story-${i+1}`,kind:'story',time}))]};
}
export const CONTENT_PILLARS = [
 ['maintenance','Practical building maintenance planning; no invented project'],
 ['committee','A clear checklist for building committee administration'],
 ['supplier','How to prepare for and follow up a supplier visit'],
 ['reporting','Explain clear maintenance reporting and follow-up'],
 ['handover','General preparation for changing a building management company'],
 ['service-area','Verified Klem building services in Central Israel and Shfela'],
];
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
export function imageDimensions(bytes) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.length>=24)return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if(bytes[0]!==255||bytes[1]!==216)throw new Error('Unsupported image header');
  let offset=2;
  while(offset+4<=bytes.length) {
    if(bytes[offset++]!==255)throw new Error('Invalid JPEG structure');
    while(bytes[offset]===255)offset++;
    const marker=bytes[offset++];
    if(marker===217||marker===218)break;
    if(marker===1||(marker>=208&&marker<=215))continue;
    if(offset+2>bytes.length)break;
    const length=bytes.readUInt16BE(offset);
    if(length<2||offset+length>bytes.length)break;
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7)return {height:bytes.readUInt16BE(offset+3),width:bytes.readUInt16BE(offset+5)};
    offset+=length;
  }
  throw new Error('JPEG dimensions unavailable');
}
function israelMinute(now) {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:INSTAGRAM_CADENCE.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  return Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);
}
function validDay(day) {return /^\d{4}-\d{2}-\d{2}$/.test(day)&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;}
function matchesCadence(slot,cadence=INSTAGRAM_CADENCE) {
  const name=slot.id?.slice(slot.day.length+1);
  const definition=cadence.slots.find(s=>s.name===name&&s.kind===slot.kind);
  return !!definition&&definition.time===slot.time&&(!definition.weekdays||definition.weekdays.includes(new Date(slot.day+'T12:00:00Z').getUTCDay()));
}
export function slotIsDue(slot,now=new Date(),cadence=INSTAGRAM_CADENCE) {
  if(slot.day!==israelDay(now)||!matchesCadence(slot,cadence))return false;
  const [h,m]=slot.time.split(':').map(Number),late=israelMinute(now)-(h*60+m);
  return late>=0&&late<cadence.maxLatenessMinutes;
}
export function instagramCalendar(start=israelDay(),days=7,cadence=INSTAGRAM_CADENCE) {
  if(!validDay(start)||!Number.isInteger(days)||days<1||days>31)throw new Error('Invalid calendar interval');
  const first=new Date(start+'T12:00:00Z');
  return Array.from({length:days},(_,offset)=>{
    const date=new Date(first);date.setUTCDate(date.getUTCDate()+offset);
    const day=date.toISOString().slice(0,10),ordinal=Math.floor(date.getTime()/86400000);
    return cadence.slots.map((s,i)=>{
      const [pillar,brief]=CONTENT_PILLARS[(ordinal+i*2)%CONTENT_PILLARS.length];
      return {id:`${day}:${s.name}`,day,...s,pillar,brief,
        format:s.kind==='story'?'Vertical 9:16 Story; all meaningful copy in the artwork':'Square or 4:5 feed artwork with a Hebrew caption',
        cycle:Math.floor(ordinal/7),status:'planned'};
    }).filter(slot=>matchesCadence(slot,cadence));
  }).flat();
}
export class InstagramQueue {
  constructor(store,{assetRoot=resolve('outputs/instagram')}={}) {
    this.store=store;this.db=store.db;this.assetRoot=assetRoot;
    this.db.exec(`CREATE TABLE IF NOT EXISTS instagram_slots (
      id TEXT PRIMARY KEY, day TEXT NOT NULL, time TEXT NOT NULL, kind TEXT NOT NULL,
      status TEXT NOT NULL, brief TEXT NOT NULL, draft TEXT, claim TEXT, receipt TEXT, error TEXT);
      CREATE TABLE IF NOT EXISTS instagram_content_hashes (hash TEXT PRIMARY KEY, slot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS instagram_manual_batches (id TEXT PRIMARY KEY, authorization TEXT NOT NULL, created TEXT NOT NULL, expires TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS instagram_manual_slots (slot_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS instagram_management_slots (
        slot_id TEXT PRIMARY KEY, content_id TEXT NOT NULL, revision INTEGER NOT NULL,
        work_id TEXT NOT NULL, operation TEXT NOT NULL, starts TEXT NOT NULL, expires TEXT NOT NULL,
        authorized_at TEXT, remote_revision INTEGER, draft_digest TEXT);`);
  }
  get(id) {
    const row=this.db.prepare('SELECT * FROM instagram_slots WHERE id=?').get(id);
    return row?{...row,brief:JSON.parse(row.brief),draft:row.draft?JSON.parse(row.draft):null,receipt:row.receipt?JSON.parse(row.receipt):null}:null;
  }
  list() {return this.db.prepare('SELECT id FROM instagram_slots ORDER BY day DESC,time DESC LIMIT 93').all().map(r=>this.get(r.id));}
  cadence() {return instagramCadence(this.store.get('instagram_schedule'));}
  calendar(start=israelDay(),days=7) {return instagramCalendar(start,days,this.cadence());}
  manualBatch(id) {return this.db.prepare('SELECT b.* FROM instagram_manual_batches b JOIN instagram_manual_slots s ON s.batch_id=b.id WHERE s.slot_id=?').get(id);}
  managed(id) {return this.db.prepare('SELECT * FROM instagram_management_slots WHERE slot_id=?').get(id);}
  managedSlot(contentId,revision) {return this.get(`managed:${contentId}:v${revision}`);}
  isDue(slot,now=new Date()) {
    const managed=this.managed(slot?.id||'');
    if(managed)return managed.operation==='publish'&&slot.day===israelDay(now)&&+now>=Date.parse(managed.starts)&&+now<Date.parse(managed.expires);
    const batch=this.manualBatch(slot?.id||'');
    return batch?slot.day===israelDay(now)&&now>=Date.parse(batch.created)&&now<Date.parse(batch.expires):slotIsDue(slot,now,this.cadence());
  }
  registerManaged(claim,now=new Date()) {
    requireManagementControl(this.store,now);
    const {id:workId,operation,payload,content,created}=claim;
    if(!/^[a-f0-9]{32}$/.test(workId)||!['generate','publish'].includes(operation)||!content||payload?.contentId!==content.id||payload.revision!==content.revision||!Number.isInteger(content.revision)||content.revision<1||!/^[a-f0-9]{32}$/.test(content.id))throw new Error('Invalid management work identity');
    if(!['instagram','facebook'].includes(content.channel)||content.channel==='facebook'&&(content.kind!=='post'||content.format!=='image')||!['image','video'].includes(content.format)||!['post','story','reel'].includes(content.kind)||content.kind==='reel'&&content.format!=='video')throw new Error('Unsupported Instagram media request');
    const slotId=`managed:${content.id}:v${content.revision}`,old=this.get(slotId),mapping=this.managed(slotId);
    if(mapping?.work_id===workId&&mapping.operation===operation)return old;
    if(operation==='generate'&&old)throw new Error('Content revision already has local generation work');
    if(operation==='publish') {
      const unattempted=old?.status==='cancelled'&&old.error==='Managed request cancelled before native claim'&&old.claim===null;
      if(!old||(!['draft','ready'].includes(old.status)&&!unattempted)||(!unattempted&&mapping?.operation!=='generate'))throw new Error('The reviewed local content revision must exist before publication');
      const remote=content.draft;
      if(!remote||remote.assets?.length!==1||remote.assets[0].sha256!==old.draft.imageHash||remote.assets[0].url!==old.draft.publicURL||remote.caption!==old.draft.caption||content.approval?.digest!==payload.draftDigest)throw new Error('Approved WhatsApp content differs from the reviewed local asset');
    }
    const starts=operation==='generate'?Number(created)*1000:payload.when==='now'?Number(created)*1000:Date.parse(payload.when);
    const expires=starts+(operation==='generate'?48*3600000:180*60000);
    if(!Number.isFinite(starts)||!Number.isFinite(expires))throw new Error('Invalid work timing');
    const date=new Date(starts),day=israelDay(date),minute=israelMinute(date),time=`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
    return this.store.transaction(()=>{
      if(operation==='generate')this.db.prepare('INSERT INTO instagram_slots(id,day,time,kind,status,brief) VALUES(?,?,?,?,?,?)')
        .run(slotId,day,time,content.kind==='story'?'story':'post','planned',JSON.stringify({management:true,channel:content.channel,contentId:content.id,revision:content.revision,format:content.format,requestedKind:content.kind,brief:content.brief,instructions:payload.instructions||'',previousDraft:payload.previousDraft||null}));
      else this.db.prepare('UPDATE instagram_slots SET day=?,time=? WHERE id=?').run(day,time,slotId);
      if(operation==='publish'&&old.status==='cancelled')this.db.prepare("UPDATE instagram_slots SET status='draft',error=NULL WHERE id=?").run(slotId);
      this.db.prepare(`INSERT INTO instagram_management_slots(slot_id,content_id,revision,work_id,operation,starts,expires,draft_digest)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(slot_id) DO UPDATE SET work_id=excluded.work_id,operation=excluded.operation,
        starts=excluded.starts,expires=excluded.expires,draft_digest=excluded.draft_digest,authorized_at=NULL,remote_revision=NULL`)
        .run(slotId,content.id,content.revision,workId,operation,date.toISOString(),new Date(expires).toISOString(),payload.draftDigest||null);
      this.store.audit('instagram_management_registered',{slotId,workId,operation,contentId:content.id,revision:content.revision},now);
      return this.get(slotId);
    });
  }
  authorizeManaged(slotId,grant,now=new Date()) {
    const control=requireManagementControl(this.store,now),work=this.managed(slotId),age=+now-Number(grant?.checkedAt)*1000;
    if(!control||!work||grant?.authorized!==true||grant.id!==work.work_id||grant.settingsRevision!==control.revision||!Number.isFinite(age)||age<0||age>60000)throw new Error('Fresh server authorization for the exact managed content is required');
    this.db.prepare('UPDATE instagram_management_slots SET authorized_at=?,remote_revision=? WHERE slot_id=?').run(new Date(grant.checkedAt*1000).toISOString(),grant.settingsRevision,slotId);
  }
  channel(id) {return this.get(id)?.brief?.channel||'instagram';}
  bind(identity,now=new Date()) {
    const channel=identity.channel||'instagram',expected=socialIdentity(channel),age=+now-Date.parse(identity.verifiedAt);
    if(!expected||identity.accountId!==expected.accountId||identity.username!==expected.username||identity.canPublish!==true||!Number.isFinite(age)||age<0||age>60000)throw new Error('Verify the exact Klem account and publishing permissions');
    const old=this.store.get(channel+'_binding');
    if(old&&old.accountId!==identity.accountId)throw new Error('Existing account differs; verify the Klem binding');
    this.store.set(channel+'_binding',{accountId:identity.accountId,username:identity.username,verifiedAt:identity.verifiedAt});
    this.store.audit('social_account_bound',{channel,accountId:identity.accountId},now);
  }
  plan(start=israelDay(),days=7) {
    const slots=this.calendar(start,days),wanted=new Map(slots.map(s=>[s.id,s]));
    this.store.transaction(()=>{
      // Retain receipts and claims; only retire unattempted work removed by the
      // owner's cadence change. The due/publish gates also enforce the cadence.
      for(const slot of this.list()) {
        if(slot.day>=start&&!matchesCadence(slot,this.cadence())&&!this.manualBatch(slot.id)&&!this.managed(slot.id)&&['planned','draft','ready'].includes(slot.status)&&!wanted.has(slot.id)) {
          this.db.prepare("UPDATE instagram_slots SET status='cancelled',error=? WHERE id=?").run('Removed by owner-updated publishing cadence',slot.id);
          this.store.audit('instagram_slot_cancelled',{id:slot.id,reason:'cadence_changed'});
        }
      }
      for(const slot of slots) {
        const old=this.get(slot.id);
        if(old&&(['planned','draft','ready'].includes(old.status)||(old.status==='cancelled'&&old.error==='Removed by owner-updated publishing cadence'))) {
          const status=old.status==='cancelled'?(old.draft?'draft':'planned'):old.status;
          this.db.prepare('UPDATE instagram_slots SET time=?,brief=?,status=?,error=NULL WHERE id=?')
            .run(slot.time,JSON.stringify(slot),status,slot.id);
          if(old.time!==slot.time||old.status!==status)this.store.audit('instagram_slot_rescheduled',{id:slot.id,from:old.time,to:slot.time,status});
        } else this.db.prepare('INSERT OR IGNORE INTO instagram_slots(id,day,time,kind,status,brief) VALUES(?,?,?,?,?,?)')
          .run(slot.id,slot.day,slot.time,slot.kind,'planned',JSON.stringify(slot));
      }
    });
    return slots.map(s=>this.get(s.id));
  }
  markMissed(now=new Date()) {
    const day=israelDay(now),minute=israelMinute(now),missed=[];
    this.store.transaction(()=>{
      for(const slot of this.list()) {
        if(!['planned','draft','ready'].includes(slot.status))continue;
        const [h,m]=slot.time.split(':').map(Number);
        const batch=this.manualBatch(slot.id);
        const managed=this.managed(slot.id);
        if(managed&&(managed.operation==='generate'||now<Date.parse(managed.expires)))continue;
        if(batch?now<Date.parse(batch.expires)&&slot.day>=day:slot.day>day||(slot.day===day&&minute<h*60+m+this.cadence().maxLatenessMinutes))continue;
        this.db.prepare("UPDATE instagram_slots SET status='missed',error=? WHERE id=?").run('Publishing window expired without verified publication; no automatic catch-up',slot.id);
        this.store.audit('instagram_slot_missed',{id:slot.id,scheduledTime:slot.time,previousStatus:slot.status},now);
        missed.push(slot.id);
      }
    });
    return missed;
  }
  due(now=new Date()) {return this.list().filter(s=>!this.managed(s.id)&&this.isDue(s,now)&&['planned','draft','ready'].includes(s.status));}
  cancelManagedUnattempted(id,workId,now=new Date()) {
    return this.store.transaction(()=>{
      const slot=this.get(id),mapping=this.managed(id);
      if(!slot||mapping?.operation!=='publish'||mapping.work_id!==workId||slot.claim||slot.receipt||!['draft','ready','missed','cancelled'].includes(slot.status))throw new Error('Cannot cancel a native publication claim or unknown attempt');
      this.db.prepare("UPDATE instagram_slots SET status='cancelled',error=? WHERE id=?").run('Managed request cancelled before native claim',id);
      this.db.prepare('UPDATE instagram_management_slots SET authorized_at=NULL,remote_revision=NULL WHERE slot_id=?').run(id);
      this.store.audit('instagram_managed_unattempted_cancelled',{id,workId},now);
      return {slotId:id,workId,draftDigest:mapping.draft_digest,nativeClaimed:false,locallyCancelled:true,checkedAt:+now/1000};
    });
  }
  retireManaged(contentStates,now=new Date()) {
    if(!Array.isArray(contentStates))return [];
    const states=new Map(contentStates.map(c=>[c.id,c])),retired=[];
    return this.store.transaction(()=>{
      for(const mapping of this.db.prepare('SELECT * FROM instagram_management_slots').all()) {
        const current=states.get(mapping.content_id),slot=this.get(mapping.slot_id);
        if(!current||!slot||slot.claim||slot.receipt||!['planned','draft','ready'].includes(slot.status))continue;
        if(current.revision===mapping.revision&&!['cancelled','rejected'].includes(current.status))continue;
        this.db.prepare("UPDATE instagram_slots SET status='cancelled',error=? WHERE id=?").run('WhatsApp content cancelled or superseded',slot.id);
        this.db.prepare('UPDATE instagram_management_slots SET authorized_at=NULL,remote_revision=NULL WHERE slot_id=?').run(slot.id);
        this.store.audit('instagram_managed_retired',{id:slot.id,contentRevision:current.revision,contentStatus:current.status},now);
        retired.push(slot.id);
      }
      return retired;
    });
  }
  claimGeneration(id,now=new Date()) {
    return this.store.transaction(()=>{
      const control=requireManagementControl(this.store,now);
      const managed=this.managed(id);
      if(managed)requireWorkAuthorization(this.store,managed,now);
      if(this.store.policy().paused)throw new Error('Manager is stopped');
      if(!socialIdentity(this.channel(id)))throw new Error('Klem account is not connected');
      if(!this.store.policy().channels.includes(this.channel(id)))throw new Error('Instagram channel is disabled');
      const scheduledReview=control?.settings?.approvalMode==='review'&&!this.manualBatch(id);
      if(this.store.policy().mode!=='autonomous'&&!managed&&!scheduledReview)throw new Error('Autonomous generation is disabled by policy');
      if(this.store.get('instagram_approval_policy')?.ownerApprovalRequiredNow===true&&!managed&&!scheduledReview)throw new Error('Owner approval mode is active');
      const slot=this.get(id);
      const allowed=managed?managed.operation==='generate'&&+now>=Date.parse(managed.starts)&&+now<Date.parse(managed.expires):this.isDue(slot,now);
      if(!slot||!allowed)throw new Error('Slot is outside its publishing window');
      if(slot.status!=='planned')throw new Error('Generation was already claimed');
      if(this.db.prepare("SELECT COUNT(*) AS n FROM instagram_slots WHERE status IN ('generating','draft','ready','awaiting_review')").get().n>=INSTAGRAM_CADENCE.maxUnpublishedDrafts)throw new Error('Unpublished draft limit reached');
      this.db.prepare("UPDATE instagram_slots SET status='generating' WHERE id=?").run(id);
      this.store.audit('instagram_generation_claimed',{id},now);
      return {...this.get(id),marketingSpec:this.store.get('marketing_spec')||null};
    });
  }
  saveDraft(id,draft,now=new Date()) {
    const slot=this.get(id);
    if(slot?.status!=='generating')throw new Error('Claim generation before saving');
    if(slot.brief.format==='video')throw new Error('Use save-video-draft for a video request');
    const root=realpathSync(this.assetRoot),path=realpathSync(draft.assetPath);
    if(!path.startsWith(root+sep))throw new Error('Asset must be inside the Instagram output folder');
    const bytes=readFileSync(path);
    if(bytes.length>8*1024*1024||bytes.length<32)throw new Error('Invalid image size');
    const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg=bytes[0]===255&&bytes[1]===216;
    if(!png&&!jpeg)throw new Error('Use a PNG draft or JPEG publication asset');
    if(typeof draft.caption!=='string'||draft.caption.length>2200||typeof draft.headline!=='string'||!draft.headline.trim())throw new Error('Invalid Instagram copy');
    if(slot.kind==='post'&&!draft.caption.trim())throw new Error('Feed posts require a caption');
    if(slot.kind==='story'&&draft.caption!=='')throw new Error('Story text belongs in the image; Story captions are unsupported');
    if(draft.review?.approved!==true||draft.review?.hebrewChecked!==true||draft.review?.claimsChecked!==true||draft.review?.visualChecked!==true)throw new Error('Complete the visual, Hebrew and claims review');
    const imageHash=sha(bytes),copyHash=sha((draft.headline+' '+draft.caption).normalize('NFKC').replace(/\s+/g,' ').trim());
    const dimensions=imageDimensions(bytes);
    const value={headline:draft.headline,caption:draft.caption,assetPath:path,imageHash,copyHash,format:jpeg?'jpeg':'png',...dimensions,
      review:draft.review,prompt:draft.prompt||'',createdAt:now.toISOString()};
    return this.persistDraft(id,value,now);
  }
  async saveVideoDraft(id,draft,now=new Date()) {
    const slot=this.get(id);
    if(slot?.status!=='generating'||slot.brief.format!=='video'||!this.managed(id))throw new Error('Claim the managed video request before saving');
    const root=realpathSync(this.assetRoot),path=realpathSync(draft.assetPath);
    if(!path.startsWith(root+sep))throw new Error('Asset must be inside the Instagram output folder');
    const info=await inspectMP4(readFileSync(path));
    if(typeof draft.headline!=='string'||!draft.headline.trim()||typeof draft.caption!=='string'||draft.caption.length>2200||slot.kind==='story'&&draft.caption!==''||slot.kind==='post'&&!draft.caption.trim())throw new Error('Invalid video copy');
    if(!['approved','hebrewChecked','claimsChecked','visualChecked','motionChecked','audioChecked'].every(k=>draft.review?.[k]===true))throw new Error('Review the complete video, audio, Hebrew and claims');
    const imageHash=info.sha256,copyHash=sha((draft.headline+' '+draft.caption).normalize('NFKC').replace(/\s+/g,' ').trim());
    return this.persistDraft(id,{...info,headline:draft.headline,caption:draft.caption,assetPath:path,imageHash,copyHash,format:'mp4',
      review:draft.review,prompt:draft.prompt||'',createdAt:now.toISOString()},now);
  }
  persistDraft(id,value,now) {
    const {imageHash,copyHash}=value;
    return this.store.transaction(()=>{
      if(this.get(id)?.status!=='generating')throw new Error('Draft state changed');
      for(const hash of [imageHash,copyHash]) {
        if(this.db.prepare('SELECT slot FROM instagram_content_hashes WHERE hash=?').get(hash))throw new Error('Duplicate creative; create a fresh image and angle');
        this.db.prepare('INSERT INTO instagram_content_hashes VALUES(?,?)').run(hash,id);
      }
      this.db.prepare("UPDATE instagram_slots SET status='draft',draft=? WHERE id=?").run(JSON.stringify(value),id);
      this.store.audit('instagram_draft_saved',{id,imageHash},now);return this.get(id);
    });
  }
  rejectGeneration(id,reason,now=new Date()) {
    if(typeof reason!=='string'||!reason.trim()||reason.length>2000)throw new Error('A concise review failure reason is required');
    return this.store.transaction(()=>{
      if(this.get(id)?.status!=='generating')throw new Error('Only an unpublished generation can be rejected');
      this.db.prepare("UPDATE instagram_slots SET status='rejected',error=? WHERE id=?").run(reason.trim(),id);
      this.store.audit('instagram_generation_rejected',{id,reason:reason.trim()},now);
      return this.get(id);
    });
  }
  markReady(id,{url,width,height,sha256,publicReadVerifiedAt},now=new Date()) {
    const slot=this.get(id),u=new URL(url),age=now.getTime()-Date.parse(publicReadVerifiedAt);
    if(!['draft','ready'].includes(slot?.status)||slot.draft.format!=='jpeg')throw new Error('A reviewed JPEG draft is required');
    if(u.origin!=='https://klem.co.il'||!/^\/Pic\/instagram\/[a-f0-9]{64}\.jpg$/.test(u.pathname)||u.search||u.hash||u.username||u.password)throw new Error('Use the approved public Klem media location');
    if(sha256!==slot.draft.imageHash||u.pathname!==`/Pic/instagram/${sha256}.jpg`||sha(readFileSync(slot.draft.assetPath))!==sha256)throw new Error('Published image bytes must match the reviewed draft');
    if(!Number.isFinite(age)||age<0||age>3600000)throw new Error('Fresh public image read-back required');
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<320||height<320)throw new Error('Invalid publication dimensions');
    if(width!==slot.draft.width||height!==slot.draft.height)throw new Error('Dimensions do not match the reviewed file');
    const ratio=width/height;
    if(slot.kind==='post'&&(ratio<0.8||ratio>1.91))throw new Error('Feed aspect ratio must be between 4:5 and 1.91:1');
    if(slot.kind==='story'&&Math.abs(ratio-9/16)>0.01)throw new Error('Stories must use a 9:16 layout');
    const value={...slot.draft,publicURL:url,width,height,publicReadVerifiedAt};
    this.db.prepare("UPDATE instagram_slots SET status='ready',draft=? WHERE id=?").run(JSON.stringify(value),id);
    return this.get(id);
  }
  async markVideoReady(id,{url,sha256,publicReadVerifiedAt},now=new Date()) {
    const slot=this.get(id),age=+now-Date.parse(publicReadVerifiedAt);
    if(!['draft','ready'].includes(slot?.status)||slot.draft.format!=='mp4')throw new Error('A reviewed MP4 draft is required');
    if(url!==`https://klem.co.il/Pic/instagram/${slot.draft.imageHash}.mp4`||sha256!==slot.draft.imageHash||!Number.isFinite(age)||age<0||age>3600000)throw new Error('Fresh public read-back of the exact reviewed MP4 is required');
    const info=await inspectMP4(readFileSync(slot.draft.assetPath));
    if(info.sha256!==sha256)throw new Error('Reviewed video bytes changed');
    return this.store.transaction(()=>{
      if(!['draft','ready'].includes(this.get(id)?.status))throw new Error('Video state changed');
      this.db.prepare("UPDATE instagram_slots SET status='ready',draft=? WHERE id=?").run(JSON.stringify({...slot.draft,publicURL:url,publicReadVerifiedAt}),id);
      return this.get(id);
    });
  }
  claimPublish(id,identity,now=new Date()) {
    return this.store.transaction(()=>{
      requireManagementControl(this.store,now);
      const managed=this.managed(id);
      if(managed)requireWorkAuthorization(this.store,managed,now);
      if(this.store.policy().paused)throw new Error('Manager is stopped');
      if(!this.store.policy().channels.includes(this.channel(id))||(this.store.policy().mode!=='autonomous'&&!managed))throw new Error('Autonomous Instagram publishing is disabled by policy');
      if(this.store.get('instagram_approval_policy')?.ownerApprovalRequiredNow===true&&!managed)throw new Error('Owner approval mode is active');
      const slot=this.get(id),bound=this.store.get(this.channel(id)+'_binding');
      if(!slot||slot.status!=='ready'||!this.isDue(slot,now))throw new Error('Only a ready, due slot can publish');
      const mediaAge=now.getTime()-Date.parse(slot.draft.publicReadVerifiedAt);
      if(!Number.isFinite(mediaAge)||mediaAge<0||mediaAge>3600000||sha(readFileSync(slot.draft.assetPath))!==slot.draft.imageHash)throw new Error('Recheck the reviewed public image before publishing');
      const age=now.getTime()-Date.parse(identity.verifiedAt);
      if(!bound||bound.accountId!==socialIdentity(this.channel(id))?.accountId||identity.username!==bound.username||identity.accountId!==bound.accountId||!Number.isFinite(age)||age<0||age>60000||identity.canPublish!==true)throw new Error('Verify and bind Klem publishing access');
      const channel=this.channel(id),video=slot.draft.format==='mp4',action=channel==='facebook'?'create_photo_post':slot.kind==='story'?'create_story':video?'create_video_post':'create_image_post';
      if(channel==='facebook'&&(slot.kind!=='post'||video))throw new Error('Facebook supports reviewed image posts only');
      if(!identity.actions?.includes(action))throw new Error('Required publishing action is unavailable');
      if(this.db.prepare("SELECT COUNT(*) AS n FROM instagram_slots WHERE status IN ('publishing','uncertain')").get().n)throw new Error('Reconcile the previous Instagram publishing attempt first');
      // A finite, owner-authorized test has its own ten immutable slots. It does
      // not change the recurring cadence or weaken identity/review/claim gates.
      if(!this.manualBatch(id)) {
      const count=this.db.prepare("SELECT COUNT(*) AS n FROM instagram_slots WHERE day=? AND kind=? AND status IN ('publishing','published','uncertain') AND id NOT IN (SELECT slot_id FROM instagram_manual_slots)").get(slot.day,slot.kind).n;
      if(count>=(slot.kind==='story'?this.cadence().storiesPerDay:this.cadence().feedPerDay))throw new Error('Daily Instagram cadence reached');
      if(slot.kind==='post') {
        const start=new Date(slot.day+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-start.getUTCDay());
        const end=new Date(start);end.setUTCDate(end.getUTCDate()+7);
        const weekly=this.db.prepare("SELECT COUNT(*) AS n FROM instagram_slots WHERE day>=? AND day<? AND kind='post' AND status IN ('publishing','published','uncertain') AND id NOT IN (SELECT slot_id FROM instagram_manual_slots)").get(start.toISOString().slice(0,10),end.toISOString().slice(0,10)).n;
        if(weekly>=this.cadence().feedPerWeek)throw new Error('Weekly Instagram feed limit reached');
      }
      if(this.store.actionCount(slot.day)>=this.store.policy().maxActionsPerDay)throw new Error('Shared daily action limit reached');
      }
      const claim=randomUUID();
      this.db.prepare("UPDATE instagram_slots SET status='publishing',claim=? WHERE id=?").run(claim,id);
      this.store.audit('instagram_publish_claimed',{id,claim,accountId:bound.accountId},now);
      return {id,claim,connector:this.channel(id)==='facebook'?'facebook_organic':'instagram',account:bound.accountId,action,
        params:slot.kind==='story'?{[video?'video_url':'image_url']:slot.draft.publicURL}:video?
          {video_url:slot.draft.publicURL,caption:slot.draft.caption,share_to_feed:true}:{image_url:slot.draft.publicURL,caption:slot.draft.caption}};
    });
  }
  validReceipt(id,receipt,bound) {
    const channel=this.channel(id),account=socialIdentity(channel)?.accountId;
    const pattern=channel==='facebook'?new RegExp('^'+account+'_[0-9]{5,30}$'):/^[0-9]{5,30}$/;
    return !!account&&bound?.accountId===account&&receipt?.verified===true&&receipt.accountId===account&&typeof receipt.mediaId==='string'&&pattern.test(receipt.mediaId);
  }
  finish(id,claim,receipt,now=new Date()) {
    return this.store.transaction(()=>{
      const slot=this.get(id),bound=this.store.get(this.channel(id)+'_binding');
      if(!slot||slot.status!=='publishing'||slot.claim!==claim)throw new Error('Publication claim does not match');
      const verified=this.validReceipt(id,receipt,bound);
      this.db.prepare('UPDATE instagram_slots SET status=?,receipt=?,error=? WHERE id=?').run(verified?'published':'uncertain',JSON.stringify(receipt||{}),verified?null:'Verify provider state; never blindly retry.',id);
      this.store.audit(verified?'instagram_published':'instagram_uncertain',{id,mediaId:verified?receipt.mediaId:null},now);return this.get(id);
    });
  }
  reconcile(id,receipt,now=new Date()) {
    return this.store.transaction(()=>{
      const slot=this.get(id),bound=this.store.get(this.channel(id)+'_binding');
      if(!slot||!['publishing','uncertain'].includes(slot.status))throw new Error('No unresolved publication');
      if(!this.validReceipt(id,receipt,bound))throw new Error('A verified native media ID from Klem is required');
      this.db.prepare("UPDATE instagram_slots SET status='published',receipt=?,error=NULL WHERE id=?").run(JSON.stringify(receipt),id);
      this.store.audit('instagram_reconciled',{id,mediaId:receipt.mediaId},now);return this.get(id);
    });
  }
}
