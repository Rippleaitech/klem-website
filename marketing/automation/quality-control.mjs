import {createHash} from 'node:crypto';
import {InstagramQueue} from './instagram.mjs';
import {israelDay} from './config.mjs';
import {requireManagementControl} from './management-control.mjs';

const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const QC_SCHEDULE = 'FREQ=DAILY;BYHOUR=9,10,11,13,14,15,16;BYMINUTE=30;BYSECOND=0';
export const CONTENT_SCHEDULE = 'FREQ=MINUTELY;INTERVAL=5';

// This is a supervisor, not a second publisher. All external actions still pass
// through InstagramQueue's account, cadence, immutable-media and claim gates.
export class MarketingQualityControl {
  constructor(store, options={}) {
    this.store=store;this.db=store.db;this.queue=new InstagramQueue(store,options);
    this.db.exec(`CREATE TABLE IF NOT EXISTS marketing_qc_incidents (
      id TEXT PRIMARY KEY, slot_id TEXT, type TEXT NOT NULL, state TEXT NOT NULL,
      first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, details TEXT NOT NULL,
      fingerprint TEXT NOT NULL, notified_fingerprint TEXT);`);
  }
  incidents() {
    return this.db.prepare('SELECT * FROM marketing_qc_incidents ORDER BY first_seen,id').all()
      .map(r=>({...r,details:JSON.parse(r.details)}));
  }
  observe(id,slotId,type,state,details,now) {
    const fp=fingerprint({type,state,details}),old=this.db.prepare('SELECT * FROM marketing_qc_incidents WHERE id=?').get(id);
    this.db.prepare(`INSERT INTO marketing_qc_incidents VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET type=excluded.type,state=excluded.state,last_seen=excluded.last_seen,
      details=excluded.details,fingerprint=excluded.fingerprint`)
      .run(id,slotId,type,state,old?.first_seen||now.toISOString(),now.toISOString(),JSON.stringify(details),fp,null);
    if(!old||old.fingerprint!==fp)this.store.audit('quality_control_incident',{id,slotId,type,state,details},now);
  }
  scan(now=new Date()) {
    const day=israelDay(now),policy=this.store.policy();
    // Repair absent calendar rows for the current seven days, preserving claims
    // and receipts. Older expired work is only recorded, never rescheduled.
    const before=new Set(this.queue.list().map(s=>s.id));
    const calendar=this.queue.plan(day,7);
    const added=calendar.filter(s=>!before.has(s.id)).map(s=>s.id);
    const missed=this.queue.markMissed(now);
    const slots=this.queue.list();
    const unresolved=slots.filter(s=>['publishing','uncertain'].includes(s.status));
    const enabled=!policy.paused&&policy.mode==='autonomous'&&policy.channels.includes('instagram')
      &&this.store.get('instagram_approval_policy')?.ownerApprovalRequiredNow!==true;
    let reviewEnabled=false;
    try {reviewEnabled=!policy.paused&&policy.channels.includes('instagram')&&requireManagementControl(this.store,now)?.settings?.approvalMode==='review';} catch { /* A stale remote connection grants no work. */ }
    const work=[];
    for(const slot of slots) {
      const id='instagram:'+slot.id,details={slotId:slot.id,kind:slot.kind,day:slot.day,time:slot.time};
      if(slot.status==='published') {
        const valid=slot.receipt?.verified===true&&!!slot.receipt.mediaId
          &&slot.receipt.accountId===this.store.get(this.queue.channel(slot.id)+'_binding')?.accountId;
        if(!valid)this.observe(id,slot.id,'receipt_invalid','needs_attention',details,now);
        else if(this.db.prepare('SELECT id FROM marketing_qc_incidents WHERE id=?').get(id))
          this.observe(id,slot.id,'publication_verified','resolved',{...details,mediaId:slot.receipt.mediaId},now);
      } else if(['publishing','uncertain'].includes(slot.status)) {
        this.observe(id,slot.id,'publication_unconfirmed','needs_attention',{...details,action:'read_native_media_then_reconcile_no_republish'},now);
        work.push({slotId:slot.id,action:'reconcile_native_media',mayPublish:false});
      } else if(slot.status==='generating') {
        const claim=this.db.prepare("SELECT at FROM audit WHERE event='instagram_generation_claimed' AND json_extract(details,'$.id')=? ORDER BY id DESC LIMIT 1").get(slot.id);
        const age=claim?(now-Date.parse(claim.at))/60000:Infinity;
        if(age>=45) {
          this.observe(id,slot.id,'generation_interrupted','needs_attention',{...details,action:'inspect_saved_artifacts_no_automatic_reset'},now);
          work.push({slotId:slot.id,action:'inspect_interrupted_generation',mayPublish:false});
        }
      } else if(['missed','rejected'].includes(slot.status)) {
        this.observe(id,slot.id,slot.status==='missed'?'window_missed':'creative_rejected','needs_attention',details,now);
        // Migrate the prior notification checkpoint without repeating old alerts.
        if(slot.status==='missed'&&(this.store.get('instagram_missed_notified')?.slotIds||[]).includes(slot.id))
          this.db.prepare('UPDATE marketing_qc_incidents SET notified_fingerprint=fingerprint WHERE id=?').run(id);
      } else if(slot.status==='cancelled'&&this.db.prepare('SELECT id FROM marketing_qc_incidents WHERE id=?').get(id)) {
        this.observe(id,slot.id,'slot_cancelled','resolved',details,now);
      } else if(slot.status==='awaiting_review') {
        this.observe(id,slot.id,'review_handoff_unconfirmed','recoverable',{...details,action:'recover_same_scheduled_draft'},now);
        work.push({slotId:slot.id,action:'recover_same_scheduled_draft',mayPublish:false});
      } else if(slot.status==='delegated'&&this.db.prepare('SELECT id FROM marketing_qc_incidents WHERE id=?').get(id)) {
        this.observe(id,slot.id,'review_handoff_complete','resolved',details,now);
      } else if((enabled||reviewEnabled)&&!this.queue.managed(slot.id)&&this.queue.isDue(slot,now)&&['planned','draft','ready'].includes(slot.status)) {
        this.observe(id,slot.id,'unfinished_due_slot','recoverable',details,now);
        if(!unresolved.length)work.push({slotId:slot.id,action:slot.status==='planned'?'run_content_workflow':slot.status==='draft'?'resume_reviewed_media_upload':reviewEnabled?'offer_scheduled_draft_for_approval':'refresh_checks_then_claim_publication',mayPublish:enabled&&!reviewEnabled});
      }
    }
    const all=this.incidents();
    const notifications=all.filter(i=>(i.state==='needs_attention'||(i.state==='resolved'&&i.notified_fingerprint!==null))&&i.notified_fingerprint!==i.fingerprint);
    const result={checkedAt:now.toISOString(),timezone:'Asia/Jerusalem',day,enabled,
      repairs:{calendarRowsAdded:added,expiredSlotsRecorded:missed},work,
      unresolvedPublications:unresolved.map(s=>s.id),notifications,
      counts:{needsAttention:all.filter(i=>i.state==='needs_attention').length,recoverable:all.filter(i=>i.state==='recoverable').length,resolved:all.filter(i=>i.state==='resolved').length},
      nextSlots:this.queue.calendar(day,7).filter(s=>s.day>day||s.time>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now)).slice(0,3).map(s=>({id:s.id,time:s.time,kind:s.kind})),
      limitation:'Local supervisor requires the Mac and Codex running; offline time cannot be repaired by this local process.'};
    this.store.set('marketing_quality_control',result);
    this.store.audit('quality_control_checked',{day,enabled,work:work.map(w=>w.slotId),missed,added,notifications:notifications.map(i=>i.id)},now);
    return result;
  }
  acknowledge(items,now=new Date()) {
    if(!Array.isArray(items)||items.some(i=>typeof i.id!=='string'||typeof i.fingerprint!=='string'))throw new Error('Pass the exact reported incident IDs and fingerprints');
    return this.store.transaction(()=>{
      const missed=new Set(this.store.get('instagram_missed_notified')?.slotIds||[]);
      for(const item of items) {
        const row=this.db.prepare('SELECT * FROM marketing_qc_incidents WHERE id=?').get(item.id);
        if(!row||row.fingerprint!==item.fingerprint)throw new Error('Incident changed; rescan before acknowledging');
        this.db.prepare('UPDATE marketing_qc_incidents SET notified_fingerprint=? WHERE id=?').run(item.fingerprint,item.id);
        if(row.type==='window_missed')missed.add(row.slot_id);
      }
      this.store.set('instagram_missed_notified',{at:now.toISOString(),slotIds:[...missed],method:'Quality-control notification checkpoint'});
      this.store.audit('quality_control_notification_acknowledged',{ids:items.map(i=>i.id)},now);
      return {acknowledged:items.length};
    });
  }
}
