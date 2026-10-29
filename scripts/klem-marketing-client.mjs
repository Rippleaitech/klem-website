import {createHmac} from 'node:crypto';
export const HOST='https://lie-3r9p.onrender.com';
export function signature(key,method,path,bytes,now=Date.now()) {
 const stamp=String(Math.floor(now/1000));
 const mac=createHmac('sha256',key).update(`${stamp}\n${method}\n${path}\n`).update(bytes).digest('hex');
 return {'x-klem-time':stamp,'x-klem-signature':'sha256='+mac};
}
