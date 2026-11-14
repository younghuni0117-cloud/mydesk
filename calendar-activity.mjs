import {todaySeoul,dateUTC,addDays,eventTargets,targetLabel} from './calendar-data.mjs?v=calendar20';
export function eventStart(event){return Date.parse(event.starts_on+'T'+(event.all_day?'00:00':event.start_time.slice(0,5))+':00+09:00');}
export function eventEnd(event){return Date.parse((event.all_day?addDays(event.ends_on,1):event.ends_on)+'T'+(event.all_day?'00:00':event.end_time.slice(0,5))+':00+09:00');}
export function upcomingEvents(events,now=new Date()){
 const instant=now.getTime();return events.filter(e=>eventEnd(e)>instant).sort((a,b)=>eventStart(a)-eventStart(b)||eventEnd(a)-eventEnd(b)||a.id.localeCompare(b.id));
}
export function countdown(event,now=new Date()){
 const today=todaySeoul(now),days=Math.round((dateUTC(event.starts_on)-dateUTC(today))/86400000);
 if(days>0)return 'D-'+days;
 if(eventStart(event)<=now.getTime()&&eventEnd(event)>now.getTime()&&(!event.all_day||days<0))return '진행 중';
 return '오늘';
}
export function eventSnapshot(event){return {title:event.title||'',person:event.person||'',location:event.location||'',notes:event.notes||'',starts_on:event.starts_on,ends_on:event.ends_on,all_day:event.all_day===true,start_time:event.all_day?null:event.start_time?.slice(0,5),end_time:event.all_day?null:event.end_time?.slice(0,5),targets:eventTargets(event)};}
export function scheduleLabel(event){const start=event.starts_on,end=event.ends_on;if(event.all_day)return (start===end?start:start+' ~ '+end)+' · 종일';return start+' '+event.start_time?.slice(0,5)+' ~ '+(start===end?'':end+' ')+event.end_time?.slice(0,5);}
export function changeDiff(before,after){
 if(!before)return [];
 const a=eventSnapshot(before),b=eventSnapshot(after),fields=[['title','제목'],['schedule','일시'],['targets','일정 대상'],['notes','메모'],['person','기존 가족 정보'],['location','기존 장소 정보']];
 const value=(e,key)=>key==='schedule'?scheduleLabel(e):key==='targets'?targetLabel(e):e[key]||'없음';
 return fields.flatMap(([key,label])=>{const old=value(a,key),next=value(b,key);return old===next?[]:[{label,before:old,after:next}];});
}
const revision=event=>Number.isSafeInteger(Number(event?.change_revision))?Number(event.change_revision):0;
export class CalendarReceipts{
 constructor(family,storage){this.prefix='mydesk.calendar.confirmed.v1:'+family+':';this.memory=new Map();if(storage!==undefined)this.storage=storage;else try{this.storage=globalThis.localStorage;}catch{this.storage=null;}}
 get(id){let saved=null;try{saved=JSON.parse(this.storage?.getItem(this.prefix+id)||'null');}catch{}if(!Number.isSafeInteger(saved?.revision)||saved.revision<0)saved=null;const memory=this.memory.get(id);return memory&&(!saved||memory.revision>saved.revision)?memory:saved;}
 acknowledge(events){let persisted=true;for(const event of events){const current=this.get(event.id),version=revision(event);if(current?.revision>=version)continue;const value={revision:version,snapshot:eventSnapshot(event)};this.memory.set(event.id,value);try{if(!this.storage)throw Error();this.storage.setItem(this.prefix+event.id,JSON.stringify(value));}catch{persisted=false;}}return persisted;}
 unread(events){const latest=new Map();for(const event of events){if(revision(event)<1||!['new','updated'].includes(event.change_kind))continue;const old=latest.get(event.id);if(!old||revision(old)<revision(event))latest.set(event.id,event);}return [...latest.values()].filter(e=>revision(e)>(this.get(e.id)?.revision||0)).sort((a,b)=>String(b.changed_at||'').localeCompare(String(a.changed_at||''))||a.id.localeCompare(b.id));}
 before(event){return this.get(event.id)?.snapshot||event.previous_values||null;}
}
