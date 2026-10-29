// Shared by the scheduled publisher and WhatsApp request executor. When remote
// management is enabled, cached settings are not sufficient permission to write.
export const MANAGEMENT_FRESH_MS=60_000;
export function requireManagementControl(store,now=new Date()) {
  const control=store.get('whatsapp_management');
  if(control?.enabled!==true)return null;
  const age=+now-Date.parse(control.checkedAt);
  if(control.healthy!==true||!Number.isFinite(age)||age<0||age>MANAGEMENT_FRESH_MS||!Number.isSafeInteger(control.revision))throw new Error('Refresh WhatsApp management state before creating or publishing content');
  return control;
}
export function requireWorkAuthorization(store,work,now=new Date()) {
  const control=requireManagementControl(store,now);
  const age=+now-Date.parse(work?.authorized_at);
  if(!control||!work||work.remote_revision!==control.revision||!Number.isFinite(age)||age<0||age>MANAGEMENT_FRESH_MS)throw new Error('Fresh authorization for this WhatsApp work item is required');
  return control;
}
