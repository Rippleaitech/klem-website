import {getStore} from '@netlify/blobs';
import {createInstagramMediaHandler,INSTAGRAM_MEDIA_STORE} from '../../server/klem-social-media.mjs';
export default createInstagramMediaHandler(()=>getStore({name:INSTAGRAM_MEDIA_STORE,consistency:'strong'}));
export const config={path:'/Pic/instagram/*'};
