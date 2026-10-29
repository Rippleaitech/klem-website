import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MarketingStore} from '../marketing/automation/store.mjs';
import {InstagramQueue} from '../marketing/automation/instagram.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const store=new MarketingStore(root+'private/marketing/marketing.sqlite');
const queue=new InstagramQueue(store,{assetRoot:root+'outputs/instagram'});
const [command='status',id,file]=process.argv.slice(2);
try {
  let result;
  if(command==='plan')result=queue.plan(id,Number(file||7));
  else if(command==='status')result={cadence:queue.cadence(),binding:store.get('instagram_binding'),automation:store.get('instagram_automation'),slots:queue.list()};
  else if(command==='due')result=queue.due();
  else if(command==='mark-missed')result={missed:queue.markMissed()};
  else if(command==='claim-generation')result=queue.claimGeneration(id);
  else if(command==='save-draft')result=queue.saveDraft(id,JSON.parse(readFileSync(file,'utf8')));
  else if(command==='save-video-draft')result=await queue.saveVideoDraft(id,JSON.parse(readFileSync(file,'utf8')));
  else if(command==='reject-generation')result=queue.rejectGeneration(id,JSON.parse(readFileSync(file,'utf8')).reason);
  else if(command==='ready')result=queue.markReady(id,JSON.parse(readFileSync(file,'utf8')));
  else if(command==='video-ready')result=await queue.markVideoReady(id,JSON.parse(readFileSync(file,'utf8')));
  else if(command==='claim-publish')result=queue.claimPublish(id,JSON.parse(readFileSync(file,'utf8')));
  else if(command==='finish'){const data=JSON.parse(readFileSync(file,'utf8'));result=queue.finish(id,data.claim,data.receipt);}
  else if(command==='bind'){queue.bind(JSON.parse(readFileSync(id,'utf8')));result={bound:true};}
  else if(command==='reconcile')result=queue.reconcile(id,JSON.parse(readFileSync(file,'utf8')));
  else throw new Error('Commands: status, plan [START DAYS], due, mark-missed, claim-generation ID, save-draft ID FILE, reject-generation ID FILE, ready ID FILE, bind FILE, claim-publish ID FILE, finish ID FILE, reconcile ID FILE');
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}finally{store.close();}
