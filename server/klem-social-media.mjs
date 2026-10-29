import {createHash} from 'node:crypto';
import {imageDimensions} from '../marketing/automation/instagram.mjs';
import {inspectMP4,INSTAGRAM_VIDEO_VERSION} from '../marketing/automation/video-media.mjs';

export const INSTAGRAM_MEDIA_STORE='klem-instagram-reviewed-v1';
export const INSTAGRAM_MEDIA_PREFIX='/Pic/instagram/';
export const INSTAGRAM_MEDIA_VERSION='klem-instagram-jpeg-v1';
export const MAX_INSTAGRAM_JPEG_BYTES=8*1024*1024;
export const imageHash=bytes=>createHash('sha256').update(bytes).digest('hex');

export function inspectJPEG(bytes) {
  if(bytes.length<32||bytes.length>MAX_INSTAGRAM_JPEG_BYTES||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new Error('Use a complete JPEG of at most 8 MB');
  const {width,height}=imageDimensions(bytes);
  if(width<320||height<320||width>10000||height>10000)throw new Error('Unsupported JPEG dimensions');
  return {width,height,sha256:imageHash(bytes)};
}

// The endpoint has no upload, delete, list or arbitrary-store capability.
export function createInstagramMediaHandler(getMediaStore) {
  return async request=>{
    const url=new URL(request.url);
    const headers={'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Cache-Control':'no-store'};
    if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{...headers,Allow:'GET, HEAD'}});
    if(url.pathname===INSTAGRAM_MEDIA_PREFIX+'status')return new Response(request.method==='HEAD'?null:JSON.stringify({service:INSTAGRAM_MEDIA_VERSION,video:INSTAGRAM_VIDEO_VERSION}),{headers:{...headers,'Content-Type':'application/json'}});
    const match=/^\/Pic\/instagram\/([a-f0-9]{64})\.(jpg|mp4)$/.exec(url.pathname);
    if(!match||url.search)return new Response(null,{status:404,headers});
    try {
      const result=await getMediaStore().get(match[1]+'.'+match[2],{type:'arrayBuffer',consistency:'strong'});
      if(result===null)return new Response(null,{status:404,headers});
      const bytes=Buffer.from(result),info=match[2]==='mp4'?await inspectMP4(bytes):inspectJPEG(bytes);
      if(info.sha256!==match[1])return new Response(null,{status:503,headers});
      const etag='"'+info.sha256+'"';
      const imageHeaders={...headers,'Content-Type':match[2]==='mp4'?'video/mp4':'image/jpeg','Content-Length':String(bytes.length),'Cache-Control':'public, max-age=31536000, immutable',ETag:etag,'Accept-Ranges':'bytes'};
      if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers:imageHeaders});
      const range=request.headers.get('Range'),ifRange=request.headers.get('If-Range');
      if(range&&(!ifRange||ifRange===etag)&&request.method==='GET') {
        const part=/^bytes=(\d*)-(\d*)$/.exec(range);
        let start=part?.[1]?Number(part[1]):part?.[2]?Math.max(0,bytes.length-Number(part[2])):NaN;
        let end=part?.[1]&&part?.[2]?Math.min(bytes.length-1,Number(part[2])):bytes.length-1;
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=bytes.length||end<start)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${bytes.length}`}});
        return new Response(bytes.subarray(start,end+1),{status:206,headers:{...imageHeaders,'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':String(end-start+1)}});
      }
      return new Response(request.method==='HEAD'?null:bytes,{headers:imageHeaders});
    } catch {
      // Do not disclose storage configuration, keys or upstream errors.
      return new Response(null,{status:503,headers});
    }
  };
}
