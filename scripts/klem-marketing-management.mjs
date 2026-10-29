import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MarketingStore} from '../marketing/automation/store.mjs';
import {ManagementClient,ManagementBridge} from '../marketing/automation/management-bridge.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const store=new MarketingStore(root+'private/marketing/marketing.sqlite');
const [command='status',id]=process.argv.slice(2);
try {
  const key=command==='status'?undefined:JSON.parse(readFileSync(root+'private/klem-marketing/connection.json','utf8')).ingestKey;
  const bridge=new ManagementBridge(store,{client:new ManagementClient({key}),assetRoot:root+'outputs/instagram'});
  let result;
  if(command==='status') {
    const state=store.get('whatsapp_management');
    result={enabled:state?.enabled===true,healthy:state?.healthy===true,revision:state?.revision,checkedAt:state?.checkedAt,lastError:state?.lastError,...bridge.snapshot()};
  } else if(command==='enable')result=await bridge.enable();
  else if(command==='sync')result=await bridge.sync();
  else if(command==='library-sync')result=await bridge.syncLibrary();
  else if(command==='scan')result=await bridge.scan();
  else if(command==='prepare')result=await bridge.prepare(id);
  else if(command==='offer-slot')result=await bridge.offerSlot(id);
  else if(command==='authorize')result=await bridge.authorize(id);
  else if(command==='report')result=await bridge.report(id);
  else if(command==='reconcile-report')result=await bridge.reconcileReport(id);
  else if(command==='cancel-unattempted')result=await bridge.cancelUnattempted(id,process.argv[4]);
  else throw new Error('Use status, enable, sync, library-sync, offer-slot SLOT, prepare ID, authorize ID, report ID, reconcile-report ID or cancel-unattempted ID REASON');
  console.log(JSON.stringify(result,null,2));
} catch(error) {console.error(error.message);process.exitCode=1;} finally {store.close();}
