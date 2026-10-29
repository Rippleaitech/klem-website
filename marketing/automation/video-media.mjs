import {createHash} from 'node:crypto';
import {Input,BufferSource,MP4} from 'mediabunny';

// Keep the same reviewed file small enough for WhatsApp previews and the
// existing public media handler. Longer/larger footage needs a reviewed export.
export const MAX_INSTAGRAM_VIDEO_BYTES=4*1024*1024;
export const INSTAGRAM_VIDEO_VERSION='klem-instagram-mp4-v1';
export async function inspectMP4(bytes) {
  if(bytes.length<64||bytes.length>MAX_INSTAGRAM_VIDEO_BYTES||bytes.subarray(4,8).toString()!=='ftyp')throw new Error('Use an MP4 of at most 4 MB');
  // Validate every top-level box boundary before parsing tracks. In particular,
  // a truncated mdat must not look like a complete reviewed export.
  let at=0;const boxes=[];
  while(at<bytes.length) {
    if(bytes.length-at<8)throw new Error('Incomplete MP4 box');
    let size=bytes.readUInt32BE(at),header=8;
    if(size===1){if(bytes.length-at<16)throw new Error('Incomplete MP4 box');size=Number(bytes.readBigUInt64BE(at+8));header=16;}
    else if(size===0)size=bytes.length-at;
    if(!Number.isSafeInteger(size)||size<header||at+size>bytes.length)throw new Error('Incomplete MP4 box');
    boxes.push(bytes.subarray(at+4,at+8).toString());at+=size;
  }
  if(!boxes.includes('moov')||!boxes.includes('mdat'))throw new Error('MP4 needs video data and metadata');
  const input=new Input({source:new BufferSource(bytes),formats:[MP4]});
  try {
    const tracks=await input.getVideoTracks(),audio=await input.getAudioTracks();
    if(tracks.length!==1||audio.length>1)throw new Error('Use one video track and at most one audio track');
    const video=tracks[0],codec=await video.getCodec(),audioCodec=audio.length?await audio[0].getCodec():null;
    const width=await video.getDisplayWidth(),height=await video.getDisplayHeight(),duration=await input.computeDuration();
    const stats=await video.computePacketStats();
    if(codec!=='avc'||audioCodec!==null&&audioCodec!=='aac'||await video.getRotation()!==0)throw new Error('Use upright H.264 video with AAC audio or no audio');
    if(!Number.isFinite(duration)||duration<3||duration>60||width<320||height<320||width>1920||height>1920)throw new Error('Use a 3–60 second video up to 1080p portrait');
    if(Math.abs(width/height-9/16)>0.01||stats.averagePacketRate<23||stats.averagePacketRate>60.1)throw new Error('Use 9:16 video at 24–60 frames per second');
    return {width,height,duration,codec,audioCodec,frameRate:stats.averagePacketRate,sha256:createHash('sha256').update(bytes).digest('hex')};
  } finally {input.dispose();}
}
