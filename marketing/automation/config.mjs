export const CHANNELS = ['facebook', 'instagram', 'google', 'chatgpt'];
import accounts from './accounts.json' with {type:'json'};
export const SOCIAL_ACCOUNTS=accounts;
export function socialIdentity(channel) {
  const value=SOCIAL_ACCOUNTS[channel];
  if(!value?.accountId||!/^\d{5,30}$/.test(value.accountId)||!value.username||['17841459475581277','1369916819542873','28429443486749470'].includes(value.accountId))return null;
  return value;
}
export const BRAND = {
  name:'KLEM',language:'he',country:'IL',timezone:'Asia/Jerusalem',currency:'ILS',
  website:'https://klem.co.il/',objective:'qualified_leads_and_bookings',
  audience:['Building committees','Property owners in Central Israel and Shfela'],
  services:['Building management','Committee administration','Maintenance coordination','Supplier supervision'],
  facts:['Golomb 40, Givatayim','Office phone 03-9153556','Emergency availability is 24/7; ordinary office hours are not verified'],
  forbiddenClaims:['Invented customer endorsements','Unverified prices or guarantees','Invented projects or before-and-after imagery'],assets:[],
};
export const DEFAULT_POLICY = {
  version: 1, mode: 'review', paused: false, dailyMinor: 0, monthlyMinor: 0,
  timezone: BRAND.timezone, currency: BRAND.currency,
  channels: ['instagram','facebook'], maxActionsPerDay: 8, maxModelCallsPerDay: 16,
  maxEvidenceAgeMinutes: 60, maxJobAgeHours: 48,
  objective: BRAND.objective,
};
export function israelDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone: BRAND.timezone, year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function minor(value, label = 'amount') {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer in agorot`);
  return value;
}
export function validatePolicy(p) {
  if (!['autonomous','review'].includes(p.mode) || typeof p.paused !== 'boolean') throw new Error('Invalid operating mode');
  for (const k of ['dailyMinor','monthlyMinor']) if (p[k] !== null) minor(p[k], k);
  if (p.dailyMinor !== null && p.monthlyMinor !== null && p.monthlyMinor < p.dailyMinor) throw new Error('Monthly cap must cover at least one daily cap');
  if (!Array.isArray(p.channels) || new Set(p.channels).size!==p.channels.length || p.channels.some(x => !CHANNELS.includes(x))) throw new Error('Invalid channels');
  for (const k of ['maxActionsPerDay','maxModelCallsPerDay','maxEvidenceAgeMinutes','maxJobAgeHours']) if (!Number.isSafeInteger(p[k]) || p[k] < 1 || p[k] > 1000) throw new Error(`Invalid ${k}`);
  if (p.currency !== 'ILS' || p.timezone !== BRAND.timezone || p.objective !== BRAND.objective) throw new Error('Unsupported currency, timezone or objective');
  return p;
}
