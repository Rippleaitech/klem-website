import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createInstagramMediaHandler,inspectJPEG,imageHash,INSTAGRAM_MEDIA_VERSION} from '../server/klem-social-media.mjs';

const bytes=readFileSync(new URL('../images/Ariel_Sharon_2.jpeg',import.meta.url));
const hash=imageHash(bytes),url='https://klem.co.il/Pic/instagram/'+hash+'.jpg';
test('serves verified JPEG bytes and matching HEAD/ETag without exposing writes',async()=>{
  const keys=[];
  const handler=createInstagramMediaHandler(()=>({get:async key=>{keys.push(key);return bytes;}}));
  const response=await handler(new Request(url));
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  const head=await handler(new Request(url,{method:'HEAD'}));assert.equal(head.status,200);assert.equal(await head.text(),'');
  const cached=await handler(new Request(url,{headers:{'If-None-Match':'"'+hash+'"'}}));assert.equal(cached.status,304);
  assert.deepEqual(keys,[hash+'.jpg',hash+'.jpg',hash+'.jpg']);
  assert.equal((await handler(new Request(url,{method:'POST',body:'x'}))).status,405);
});
test('unknown paths and traversal cannot read another key',async()=>{
  const handler=createInstagramMediaHandler(()=>{throw new Error('must not access storage');});
  for(const path of ['private.json','../private/credentials','abcd.jpg','A'.repeat(64)+'.jpg',hash+'.jpg?secret=1'])assert.equal((await handler(new Request('https://klem.co.il/Pic/instagram/'+path))).status,404);
  assert.deepEqual(await (await handler(new Request('https://klem.co.il/Pic/instagram/status'))).json(),{service:INSTAGRAM_MEDIA_VERSION,video:'klem-instagram-mp4-v1'});
});
test('missing, corrupt, non-JPEG and mismatched images are not served or cached',async()=>{
  for(const [value,status] of [[null,404],[Buffer.from('<html>bad</html>'),503],[Buffer.concat([bytes,Buffer.from('changed')]),503]]){
    const handler=createInstagramMediaHandler(()=>({get:async()=>value}));const response=await handler(new Request(url));
    assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.throws(()=>inspectJPEG(bytes.subarray(0,bytes.length-2)),/complete JPEG/);
  const mismatched=createInstagramMediaHandler(()=>({get:async()=>bytes}));
  assert.equal((await mismatched(new Request('https://klem.co.il/Pic/instagram/'+'0'.repeat(64)+'.jpg'))).status,503);
});
