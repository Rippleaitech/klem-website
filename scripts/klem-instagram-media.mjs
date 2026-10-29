import {readFileSync,realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {MarketingStore} from '../marketing/automation/store.mjs';
import {InstagramQueue} from '../marketing/automation/instagram.mjs';
import {requireManagementControl,requireWorkAuthorization} from '../marketing/automation/management-control.mjs';
import {inspectJPEG,INSTAGRAM_MEDIA_STORE,INSTAGRAM_MEDIA_VERSION,MAX_INSTAGRAM_JPEG_BYTES} from '../server/klem-social-media.mjs';
import {inspectMP4,INSTAGRAM_VIDEO_VERSION,MAX_INSTAGRAM_VIDEO_BYTES} from '../marketing/automation/video-media.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const assetRoot=resolve(root,'outputs/instagram');
const siteId='cad4d21f-fa89-4d0f-a522-e92a8a6c82c7';
const base='https://klem.co.il/Pic/instagram/';
const [command,slotId]=process.argv.slice(2);
if(!['check','upload'].includes(command))throw new Error('Usage: node scripts/klem-instagram-media.mjs check | upload SLOT_ID');
async function getPublic(url) {
  return fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache'}});
}
async function readMedia(response,video) {
  if(!response.ok||response.headers.get('content-type')?.split(';')[0]!== (video?'video/mp4':'image/jpeg'))throw new Error('Public media read-back failed');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>(video?MAX_INSTAGRAM_VIDEO_BYTES:MAX_INSTAGRAM_JPEG_BYTES))throw new Error('Public media exceeds size limit');chunks.push(value);}}
  finally {await reader.cancel();}
  return Buffer.concat(chunks);
}
try {
  const health=await getPublic(base+'status');
  if(!health.ok||health.headers.get('content-type')?.split(';')[0]!=='application/json')throw new Error('The public media service is not deployed or verified; no upload attempted');
  const capabilities=await health.json();
  if(capabilities.service!==INSTAGRAM_MEDIA_VERSION)throw new Error('The public media service version is not supported');
  if(command==='check')console.log(JSON.stringify({ready:true,...capabilities,videoReady:capabilities.video===INSTAGRAM_VIDEO_VERSION,checkedAt:new Date().toISOString()}));
  else {
    const state=JSON.parse(readFileSync(root+'.netlify/state.json','utf8'));
    if(state.siteId!==siteId)throw new Error('Netlify project does not match Klem');
    const store=new MarketingStore(root+'private/marketing/marketing.sqlite');
    try {
      const queue=new InstagramQueue(store,{assetRoot}),policy=store.policy();
      const control=requireManagementControl(store);
      const managed=queue.managed(slotId);
      if(managed)requireWorkAuthorization(store,managed);
      const scheduledReview=control?.settings?.approvalMode==='review'&&!queue.manualBatch(slotId);
      if(policy.paused||(policy.mode!=='autonomous'&&!managed&&!scheduledReview)||!policy.channels.includes(queue.channel(slotId)))throw new Error('Instagram publishing is stopped or disabled');
      const slot=queue.get(slotId);
      if(!['draft','ready'].includes(slot?.status)||!['jpeg','mp4'].includes(slot.draft.format)||!['approved','hebrewChecked','claimsChecked','visualChecked'].every(k=>slot.draft.review?.[k]===true))throw new Error('A reviewed JPEG or MP4 slot is required');
      const video=slot.draft.format==='mp4';
      if(video&&capabilities.video!==INSTAGRAM_VIDEO_VERSION)throw new Error('MP4 media hosting is not deployed yet');
      const inspect=video?inspectMP4:inspectJPEG;
      const path=realpathSync(slot.draft.assetPath);
      if(!path.startsWith(realpathSync(assetRoot)+sep))throw new Error('Asset is outside the Instagram workspace');
      const bytes=readFileSync(path),info=await inspect(bytes);
      if(info.sha256!==slot.draft.imageHash)throw new Error('Reviewed image changed');
      const ratio=info.width/info.height;
      if(!video&&slot.kind==='post'&&(ratio<0.8||ratio>1.91)||(video||slot.kind==='story')&&Math.abs(ratio-9/16)>0.01)throw new Error('Wrong Instagram aspect ratio');
      const key=info.sha256+(video?'.mp4':'.jpg'),url=base+key;
      let response=await getPublic(url);
      if(response.status===404) {
        // Freeze bytes before spawning the CLI, which uses its existing local login.
        const immutable=resolve(assetRoot,'media',key);mkdirSync(dirname(immutable),{recursive:true});
        try {writeFileSync(immutable,bytes,{flag:'wx',mode:0o600});}
        catch(error){if(error.code!=='EEXIST'||(await inspect(readFileSync(immutable))).sha256!==info.sha256)throw error;}
        store.audit('instagram_media_upload_attempted',{slotId,sha256:info.sha256,url});
        const result=spawnSync(process.execPath,[root+'node_modules/netlify-cli/bin/run.js','blobs:set',INSTAGRAM_MEDIA_STORE,key,'--input',immutable],{cwd:root,env:{...process.env,NETLIFY_SITE_ID:siteId},encoding:'utf8',timeout:60000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
        if(result.status!==0)throw new Error('Netlify upload did not finish; verify the public URL before any retry. Credentials and raw CLI output are not logged.');
        response=await getPublic(url);
      }
      const published=await inspect(await readMedia(response,video));
      if(published.sha256!==info.sha256)throw new Error('Public bytes differ from the reviewed media');
      const manifest={url,...published,publicReadVerifiedAt:new Date().toISOString()};
      if(video)await queue.markVideoReady(slotId,manifest);else queue.markReady(slotId,manifest);
      store.audit('instagram_media_verified',{slotId,...manifest});
      console.log(JSON.stringify(manifest,null,2));
    } finally {store.close();}
  }
} catch(error) {console.error(error.message);process.exitCode=1;}
