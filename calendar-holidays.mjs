import {KOREAN_HOLIDAYS} from './data/korean-holidays.mjs?v=calendar3';
import {todaySeoul,dateUTC,eventPayload} from './calendar-data.mjs?v=calendar20';
// Three calendar months, clamped to the last date of the destination month.
export function holidayHorizon(day=todaySeoul()){
 const source=dateUTC(day),end=new Date(Date.UTC(source.getUTCFullYear(),source.getUTCMonth()+4,0));
 end.setUTCDate(Math.min(source.getUTCDate(),end.getUTCDate()));return end.toISOString().slice(0,10);
}
export function withinHolidayHorizon(event,day=todaySeoul()){return event.ends_on>=day&&event.starts_on<=holidayHorizon(day);}
export async function holidayEventId(calendarId,key){
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('mydesk.holiday.v1/'+calendarId+'/'+key))).slice(0,16);
 bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}
export async function holidayDefaults(calendarId,ranges){
 const rows=[];for(const year of Object.values(KOREAN_HOLIDAYS))for(const [day,names] of Object.entries(year))if(ranges.some(([start,end])=>day>=start&&day<=end))for(const title of names){const key=day+':'+title;rows.push({...eventPayload({id:await holidayEventId(calendarId,key),title,targets:['holiday'],starts_on:day,ends_on:day,all_day:true}),calendar_id:calendarId,holiday_key:key});}return rows;
}
const imported=new WeakMap(),pending=new WeakMap();
export async function ensureHolidayEvents(store,visibleRanges=[],day=todaySeoul()){
 // Ignore duplicate IDs rather than upserting: retain edits and deletion tombstones.
 if(pending.has(store))await pending.get(store);
 const ranges=[...visibleRanges,[day,holidayHorizon(day)]],known=imported.get(store)||new Set(),missing=ranges.filter(range=>!known.has(range.join('/')));if(!missing.length)return;
 const operation=(async()=>{const rows=await holidayDefaults(store.calendarId,missing);if(rows.length)await store.request('?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(rows)});for(const range of missing)known.add(range.join('/'));imported.set(store,known);})();pending.set(store,operation);try{await operation;}finally{if(pending.get(store)===operation)pending.delete(store);}
}
