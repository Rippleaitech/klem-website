import {createHmac,timingSafeEqual} from 'node:crypto';
import {stores,json} from '../../replay/server.mjs';
export function available(meta,key,now=Date.now()) {
  return !!meta && meta.key===key && !meta.test && !meta.deleted &&
    meta.consentReceipt?.version===2 && meta.consentReceipt?.replay===true &&
    Number.isFinite(meta.started) && meta.started>=now-30*86400000 &&
    meta.expires>now+300000 && meta.consentReceipt.expires>now+300000;
}
export const createHandler=(database=stores,clock=Date.now)=>async(req,context)=>{
  const key=process.env.KLEM_REPORT_INGEST_KEY||'', stamp=req.headers.get('x-klem-time')||'';
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  if(key.length<32)return json({error:'Reporting not configured'},503);
  if(!/^\d+$/.test(stamp)||Math.abs(clock()/1000-Number(stamp))>60)return json({error:'Forbidden'},403);
  const reader=req.body?.getReader();if(!reader)return json({error:'Invalid request'},400);
  let size=0;const chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();return json({error:'Request too large'},413);}chunks.push(Buffer.from(value));}
  const raw=Buffer.concat(chunks);
  const expected='sha256='+createHmac('sha256',key).update(`recording-availability\n${stamp}\n`).update(raw).digest('hex');
  const signature=req.headers.get('x-klem-signature')||'';
  if(!/^sha256=[0-9a-f]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return json({error:'Forbidden'},403);
  try {
    const b=JSON.parse(raw);if(Object.keys(b).length!==1||!/^\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}$/.test(b.prefix||''))return json({error:'Invalid source'},400);
    const db=database(context);if(!db.production)return json({error:'Production only'},403);
    return json({available:available(await db.sessions.get(b.prefix,{type:'json'}),b.prefix,clock())});
  }catch{return json({error:'Unable to verify recording'},503);}
};
export default createHandler();
export const config={path:'/internal/recording-available'};
