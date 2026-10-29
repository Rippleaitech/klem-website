import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {DEFAULT_POLICY, validatePolicy, CHANNELS, israelDay, minor} from './config.mjs';
import {requireManagementControl} from './management-control.mjs';

export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class MarketingStore {
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true,mode:0o700});
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, dedupe TEXT UNIQUE NOT NULL, channel TEXT NOT NULL, kind TEXT NOT NULL,
        status TEXT NOT NULL, created TEXT NOT NULL, day TEXT NOT NULL, amount INTEGER NOT NULL, payload TEXT NOT NULL,
        receipt TEXT, error TEXT, policy_version INTEGER);
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at TEXT NOT NULL, event TEXT NOT NULL, details TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, day TEXT NOT NULL, status TEXT NOT NULL, result TEXT);
      CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, channel TEXT NOT NULL, stage TEXT NOT NULL, day TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS model_calls (id TEXT PRIMARY KEY, day TEXT NOT NULL, agent TEXT NOT NULL, status TEXT NOT NULL);`);
    this.db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('policy', JSON.stringify(DEFAULT_POLICY));
    // An interrupted external write may have succeeded. Never silently replay it.
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {const result = fn(); this.db.exec('COMMIT'); return result;} catch(error) {this.db.exec('ROLLBACK'); throw error;}
  }
  get(key) {const row=this.db.prepare('SELECT value FROM settings WHERE key=?').get(key);return row?JSON.parse(row.value):null;}
  set(key,value) {this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
  audit(event,details,now=new Date()) {this.db.prepare('INSERT INTO audit(at,event,details) VALUES (?,?,?)').run(now.toISOString(),event,JSON.stringify(details));}
  policy() {return this.get('policy');}
  updatePolicy(changes, now=new Date()) {
    const allowed = ['mode','paused','dailyMinor','monthlyMinor','channels','maxActionsPerDay','maxModelCallsPerDay'];
    if(Object.keys(changes).some(k=>!allowed.includes(k)))throw new Error('Unsupported policy change');
    return this.transaction(()=>{const p=validatePolicy({...this.policy(),...changes,version:this.policy().version+1});this.set('policy',p);this.audit('policy_updated',p,now);return p;});
  }
  enqueue({channel,kind,payload,amount=0,dedupe},now=new Date()) {
    if(!CHANNELS.includes(channel)||!['post','ad'].includes(kind))throw new Error('Invalid channel or work type');
    minor(amount);
    const id=randomUUID();
    this.db.prepare('INSERT OR IGNORE INTO jobs(id,dedupe,channel,kind,status,created,day,amount,payload) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id,dedupe,channel,kind,'draft',now.toISOString(),israelDay(now),amount,JSON.stringify(payload));
    return this.jobByDedupe(dedupe);
  }
  decode(row) {return row?{...row,payload:JSON.parse(row.payload),receipt:row.receipt?JSON.parse(row.receipt):null}:null;}
  jobByDedupe(key) {return this.decode(this.db.prepare('SELECT * FROM jobs WHERE dedupe=?').get(key));}
  job(id) {return this.decode(this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id));}
  jobs() {return this.db.prepare('SELECT * FROM jobs ORDER BY created DESC, rowid DESC LIMIT 200').all().map(r=>this.decode(r));}
  actionCount(day) {
    const jobs=this.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE day=? AND status IN ('executing','accepted','uncertain')").get(day).n;
    const hasInstagram=this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='instagram_slots'").get();
    const instagram=hasInstagram?this.db.prepare("SELECT COUNT(*) AS n FROM instagram_slots WHERE day=? AND status IN ('publishing','published','uncertain')").get(day).n:0;
    return jobs+instagram;
  }
  budget(now=new Date()) {
    const day=israelDay(now),month=day.slice(0,7);
    const reserved=prefix=>this.db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM jobs WHERE day LIKE ? AND status IN ('executing','accepted','uncertain')").get(prefix+'%').n;
    return {day, dailyReservedMinor:reserved(day),monthlyReservedMinor:reserved(month),policy:this.policy(),evidence:this.get('evidence')};
  }
  recordEvidence(e,now=new Date()) {
    if(e.currency!=='ILS'||e.timezone!=='Asia/Jerusalem'||e.day!==israelDay(now)||e.scope!=='all_marketing_accounts')throw new Error('Evidence must cover all marketing accounts for today in Israel');
    if(!Array.isArray(e.channels)||CHANNELS.some(c=>!e.channels.includes(c)))throw new Error('Evidence must explicitly cover every channel, including confirmed zero accounts');
    for(const k of ['dailyExposureMinor','monthlyExposureMinor'])minor(e[k],k);
    if(e.monthlyExposureMinor<e.dailyExposureMinor)throw new Error('Monthly exposure cannot be below daily exposure');
    const age=now.getTime()-Date.parse(e.retrievedAt);
    if(!Number.isFinite(age)||age<0||age>this.policy().maxEvidenceAgeMinutes*60000)throw new Error('Evidence is stale or future dated');
    this.set('evidence',e);this.audit('account_exposure_reconciled',{retrievedAt:e.retrievedAt,day:e.day},now);
  }
  approve(id,now=new Date()) {
    const job=this.job(id);if(!job||job.status!=='draft')throw new Error('Only a draft can be approved');
    this.db.prepare("UPDATE jobs SET status='approved',policy_version=? WHERE id=?").run(this.policy().version,id);
    this.audit('job_approved',{id},now);
  }
  cancel(id,now=new Date()) {
    if(!['draft','approved','blocked'].includes(this.job(id)?.status))throw new Error('Only an unattempted job can be cancelled');
    this.db.prepare("UPDATE jobs SET status='cancelled' WHERE id=?").run(id);this.audit('job_cancelled',{id},now);
  }
  reserve(id,now=new Date()) {
    return this.transaction(()=>{
      requireManagementControl(this,now);
      const job=this.job(id),p=this.policy(),day=israelDay(now);
      if(!job||!['draft','approved','blocked'].includes(job.status))throw new Error('Job has already been attempted or cancelled');
      if(p.paused)throw new Error('Manager is stopped');
      if(!p.channels.includes(job.channel))throw new Error('Channel is disabled');
      if(now.getTime()-Date.parse(job.created)>p.maxJobAgeHours*3600000)throw new Error('Creative has expired; prepare a fresh brief');
      if(p.mode==='review'&&(job.status!=='approved'||job.policy_version!==p.version))throw new Error('Approval required under the current policy');
      const count=this.actionCount(day);
      if(count>=p.maxActionsPerDay)throw new Error('Daily action limit reached');
      if(job.kind==='ad') {
        if(this.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('executing','uncertain') AND kind='ad'").get().n)throw new Error('Resolve outstanding paid actions before committing more budget');
        if(!job.amount)throw new Error('Paid work requires a positive total commitment');
        if(p.dailyMinor===null||p.monthlyMinor===null)throw new Error('Set both daily and monthly advertising limits');
        const e=this.get('evidence'),b=this.budget(now);
        const age=now.getTime()-Date.parse(e?.retrievedAt);
        if(!e||e.day!==day||!Number.isFinite(age)||age<0||age>p.maxEvidenceAgeMinutes*60000)throw new Error('Fresh all-account spend and commitments are required');
        // Conservative: retain all local reservations even if a newer provider
        // snapshot includes them. Double counting reduces capacity, never raises it.
        if(e.dailyExposureMinor+b.dailyReservedMinor+job.amount>p.dailyMinor)throw new Error('Daily budget would be exceeded');
        if(e.monthlyExposureMinor+b.monthlyReservedMinor+job.amount>p.monthlyMinor)throw new Error('Monthly budget would be exceeded');
      }
      this.db.prepare("UPDATE jobs SET status='executing',day=?,error=NULL WHERE id=?").run(day,id);
      this.audit('execution_reserved',{id,amount:job.amount,day},now);return this.job(id);
    });
  }
  finish(id,status,receipt=null,error=null,now=new Date()) {
    if(!['accepted','uncertain'].includes(status))throw new Error('Invalid attempted result');
    this.transaction(()=>{
      if(this.job(id)?.status!=='executing')throw new Error('Job is not executing');
      this.db.prepare('UPDATE jobs SET status=?,receipt=?,error=? WHERE id=?').run(status,receipt?JSON.stringify(receipt):null,error,id);
      this.audit('execution_'+status,{id,receipt,error},now);
    });
  }
  block(id,message) {this.db.prepare("UPDATE jobs SET status='blocked',error=? WHERE id=? AND status IN ('draft','blocked')").run(message,id);}
  lead({id,channel,stage,day=israelDay()},now=new Date()) {
    if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{3,100}$/.test(id)||!CHANNELS.includes(channel)||!['new','qualified','booked','lost'].includes(stage)||!/^\d{4}-\d{2}-\d{2}$/.test(day)||day>israelDay(now))throw new Error('Invalid lead outcome; use an opaque CRM ID');
    const old=this.db.prepare('SELECT * FROM leads WHERE id=?').get(id);
    if(old&&(old.channel!==channel||old.day!==day))throw new Error('An existing lead cannot change acquisition channel or date');
    this.db.prepare('INSERT INTO leads VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET stage=excluded.stage').run(id,channel,stage,day);
    this.audit('lead_outcome',{id,channel,stage},now);
  }
  outcomes() {return this.db.prepare('SELECT channel,stage,COUNT(*) AS count FROM leads GROUP BY channel,stage').all();}
  modelCall(agent,now=new Date()) {
    return this.transaction(()=>{const day=israelDay(now),p=this.policy();
      requireManagementControl(this,now);
      if(p.paused)throw new Error('Manager is stopped');
      if(this.db.prepare('SELECT COUNT(*) AS n FROM model_calls WHERE day=?').get(day).n>=p.maxModelCallsPerDay)throw new Error('Daily model call limit reached');
      const id=randomUUID();this.db.prepare('INSERT INTO model_calls VALUES (?,?,?,?)').run(id,day,agent,'attempted');return id;
    });
  }
  close() {this.db.close();}
}
