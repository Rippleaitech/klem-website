import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MarketingStore} from '../marketing/automation/store.mjs';
import {MarketingQualityControl} from '../marketing/automation/quality-control.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const store=new MarketingStore(root+'private/marketing/marketing.sqlite');
try {
  const qc=new MarketingQualityControl(store,{assetRoot:root+'outputs/instagram'});
  const [command='scan',file]=process.argv.slice(2);
  let result;
  if(command==='scan'){
    result=qc.scan();
    writeFileSync(root+'outputs/instagram/calendar.json',JSON.stringify(qc.queue.plan(result.day,7),null,2)+'\n');
  } else if(command==='status')result={lastScan:store.get('marketing_quality_control'),incidents:qc.incidents()};
  else if(command==='ack')result=qc.acknowledge(JSON.parse(readFileSync(file,'utf8')));
  else throw new Error('Commands: scan, status, ack FILE');
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}finally{store.close();}
