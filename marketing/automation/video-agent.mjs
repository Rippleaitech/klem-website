import {socialIdentity} from './config.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {InstagramQueue} from './instagram.mjs';
import {requireWorkAuthorization} from './management-control.mjs';
import {INSTAGRAM_VIDEO_VERSION} from './video-media.mjs';

export const VIDEO_WORKSPACE=69596412;
const MODELS=['seedance-2','seedance-2-fast','seedance-2-mini'];
export function videoReady(store,now=new Date()) {
  const value=store.get('instagram_video_readiness'),age=+now-Date.parse(value?.checkedAt);
  return value?.workspaceId===VIDEO_WORKSPACE&&value?.accountId===socialIdentity('instagram')?.accountId&&value?.mediaVersion===INSTAGRAM_VIDEO_VERSION&&value?.canPublish===true&&value?.availableModels?.some(m=>MODELS.includes(m))&&Number.isFinite(age)&&age>=0&&age<=3600000;
}
export class VideoAgent {
  constructor(store,{assetRoot}={}) {
    this.store=store;this.db=store.db;this.queue=new InstagramQueue(store,assetRoot?{assetRoot}:{});
    this.db.exec(`CREATE TABLE IF NOT EXISTS instagram_video_jobs (
      slot_id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, request TEXT NOT NULL,
      request_hash TEXT NOT NULL, created TEXT NOT NULL, status TEXT NOT NULL,
      task_id TEXT UNIQUE, result TEXT);`);
  }
  bind(value,now=new Date()) {
    const age=+now-Date.parse(value?.checkedAt);
    if(value?.workspaceId!==VIDEO_WORKSPACE||value?.accountId!==socialIdentity('instagram')?.accountId||value?.username!==socialIdentity('instagram')?.username||value?.mediaVersion!==INSTAGRAM_VIDEO_VERSION||value?.canPublish!==true||!Array.isArray(value.availableModels)||!value.availableModels.some(m=>MODELS.includes(m))||!['create_video_post','create_story'].every(a=>value.actions?.includes(a))||!Number.isFinite(age)||age<0||age>60000)throw new Error('Verify the connected Runway workspace, Klem video actions and deployed MP4 hosting first');
    this.store.set('instagram_video_readiness',{workspaceId:VIDEO_WORKSPACE,accountId:value.accountId,mediaVersion:value.mediaVersion,canPublish:true,availableModels:value.availableModels.filter(m=>MODELS.includes(m)),checkedAt:value.checkedAt});
    this.store.audit('instagram_video_readiness_verified',{workspaceId:VIDEO_WORKSPACE,accountId:value.accountId},now);
    return {ready:videoReady(this.store,now),workspaceId:VIDEO_WORKSPACE};
  }
  get(slotId) {
    const row=this.db.prepare('SELECT * FROM instagram_video_jobs WHERE slot_id=?').get(slotId);
    return row?{...row,request:JSON.parse(row.request),result:row.result?JSON.parse(row.result):null}:null;
  }
  claim(slotId,request,now=new Date()) {
    const slot=this.queue.get(slotId),mapping=this.queue.managed(slotId);
    requireWorkAuthorization(this.store,mapping,now);
    if(this.store.policy().paused||!this.store.policy().channels.includes('instagram')||!videoReady(this.store,now))throw new Error('Video creation is stopped or its readiness check expired');
    if(slot?.status!=='generating'||slot.brief.format!=='video'||mapping?.operation!=='generate')throw new Error('Claim the managed video generation first');
    const keys=['model','promptText','ratio','resolution','generateAudio','duration','startFrame'];
    if(!request||Object.keys(request).some(k=>!keys.includes(k))||!this.store.get('instagram_video_readiness').availableModels.includes(request.model)||typeof request.promptText!=='string'||!request.promptText.trim()||request.promptText.length>3500||request.ratio!=='9:16'||request.resolution!=='720p'||typeof request.generateAudio!=='boolean')throw new Error('Use a verified supported model, a bounded prompt and portrait 720p video');
    if(request.duration!==undefined&&(!Number.isInteger(request.duration)||request.duration<4||request.duration>15))throw new Error('This initial video route supports requested lengths of 4–15 seconds');
    if(request.startFrame&&(!request.startFrame.url||Object.keys(request.startFrame).join(',')!=='url'||!/^https:\/\/klem\.co\.il\/Pic\/instagram\/[a-f0-9]{64}\.jpg$/.test(request.startFrame.url)))throw new Error('Starting frames must be reviewed Klem images');
    return this.store.transaction(()=>{
      if(this.get(slotId))throw new Error('Video submission already claimed; reconcile that attempt without regenerating');
      const attemptId=randomUUID(),serialized=JSON.stringify(request),hash=createHash('sha256').update(serialized).digest('hex');
      this.db.prepare('INSERT INTO instagram_video_jobs(slot_id,attempt_id,request,request_hash,created,status) VALUES(?,?,?,?,?,?)').run(slotId,attemptId,serialized,hash,now.toISOString(),'submitting');
      this.store.audit('instagram_video_submission_claimed',{slotId,attemptId,workspaceId:VIDEO_WORKSPACE,requestHash:hash},now);
      return {slotId,attemptId,tool:'runway_generate_video',params:structuredClone(request)};
    });
  }
  submitted(slotId,{attemptId,taskId},now=new Date()) {
    return this.store.transaction(()=>{
      const row=this.get(slotId);
      if(!row||row.attempt_id!==attemptId||!['submitting','submitted'].includes(row.status)||typeof taskId!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(taskId)||row.task_id&&row.task_id!==taskId)throw new Error('Video task acknowledgement does not match the original claim');
      this.db.prepare("UPDATE instagram_video_jobs SET status='submitted',task_id=? WHERE slot_id=?").run(taskId,slotId);
      this.store.audit('instagram_video_task_recorded',{slotId,taskId},now);
      return {slotId,taskId,status:'submitted'};
    });
  }
  result(slotId,result,now=new Date()) {
    return this.store.transaction(()=>{
      const row=this.get(slotId);
      if(!row||result?.taskId!==row.task_id||!row.task_id||!['submitted','succeeded','failed'].includes(row.status))throw new Error('Read back the original video task before recording its outcome');
      if(!['SUCCEEDED','FAILED'].includes(result.status)||!['video','task_failed'].includes(result.kind)||result.status==='SUCCEEDED'&&result.kind!=='video'||result.status==='FAILED'&&result.kind!=='task_failed')throw new Error('Only a terminal video result can be recorded');
      const status=result.status==='SUCCEEDED'?'succeeded':'failed';
      if(row.status!=='submitted') {if(row.status!==status)throw new Error('Recorded terminal video outcome differs');return {slotId,taskId:row.task_id,status};}
      // Provider URLs may contain tokens. Store them privately, never copy them
      // into user previews; previews use the reviewed hash-addressed media.
      if(status==='succeeded') {const url=new URL(result.url);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Provider output must be HTTPS');}
      const saved={taskId:row.task_id,status:result.status,kind:result.kind,...(status==='succeeded'?{url:result.url}:{reason:String(result.errorInfo?.userMessage||'Video generation failed').slice(0,500)})};
      this.db.prepare('UPDATE instagram_video_jobs SET status=?,result=? WHERE slot_id=?').run(status,JSON.stringify(saved),slotId);
      this.store.audit('instagram_video_task_finished',{slotId,taskId:row.task_id,status},now);
      return {slotId,taskId:row.task_id,status};
    });
  }
}
