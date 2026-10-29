import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MarketingStore} from '../marketing/automation/store.mjs';
import {VideoAgent} from '../marketing/automation/video-agent.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const store=new MarketingStore(root+'private/marketing/marketing.sqlite');
const [command='status',id,file]=process.argv.slice(2);
try {
  const agent=new VideoAgent(store,{assetRoot:root+'outputs/instagram'});let result;
  const input=path=>JSON.parse(readFileSync(path,'utf8'));
  if(command==='bind-readiness')result=agent.bind(input(id));
  else if(command==='claim')result=agent.claim(id,input(file));
  else if(command==='submitted')result=agent.submitted(id,input(file));
  else if(command==='result')result=agent.result(id,input(file));
  else if(command==='status'){const job=agent.get(id);result=job?{slotId:id,status:job.status,attemptId:job.attempt_id,taskId:job.task_id,created:job.created}:null;}
  else throw new Error('Use bind-readiness FILE, claim SLOT FILE, submitted SLOT FILE, result SLOT FILE or status SLOT');
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}finally{store.close();}
