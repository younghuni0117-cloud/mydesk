import {SHARED_MODEL_URL,SHARED_MODEL_KEY} from './robot-shared-config.mjs?v=robot31';
export const CATEGORIES=Object.freeze({family:{label:'공통',color:'#4285f4',soft:'#eaf2ff'},personal:{label:'영훈',color:'#8e63ce',soft:'#f2ebfc'},school:{label:'서정',color:'#df9130',soft:'#fff3df'},medical:{label:'하경',color:'#289c83',soft:'#e6f5f0'},other:{label:'하윤',color:'#788594',soft:'#edf0f4'}});
export function todaySeoul(now=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;}
export const dateUTC=iso=>new Date(iso+'T00:00:00Z');
export function addDays(iso,n){const d=dateUTC(iso);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function monthStart(iso){return iso.slice(0,7)+'-01';}
export function shiftMonth(iso,n){const d=dateUTC(monthStart(iso));d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,10);}
export function monthDays(iso){const first=monthStart(iso),start=addDays(first,-dateUTC(first).getUTCDay());const last=addDays(shiftMonth(first,1),-1),count=Math.ceil((dateUTC(last)-dateUTC(start))/86400000+1);return Array.from({length:Math.ceil(count/7)*7},(_,i)=>addDays(start,i));}
export function weekDays(iso){const first=addDays(iso,-dateUTC(iso).getUTCDay());return Array.from({length:7},(_,i)=>addDays(first,i));}
export function hourLater(day,time){const d=new Date(day+'T'+time+':00Z');d.setUTCHours(d.getUTCHours()+1);return {day:d.toISOString().slice(0,10),time:d.toISOString().slice(11,16)};}
export function onDay(event,day){return event.starts_on<=day&&event.ends_on>=day&&(event.all_day||day!==event.ends_on||event.end_time!=='00:00');}
export function timedLayout(events,day){
 const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
 const rows=events.filter(e=>!e.all_day&&onDay(e,day)).map(event=>({event,start:event.starts_on<day?0:minute(event.start_time),end:event.ends_on>day?1440:minute(event.end_time)})).sort((a,b)=>a.start-b.start||a.end-b.end);
 let group=[],until=0;const finish=()=>{const lanes=[];for(const row of group){let lane=lanes.findIndex(end=>end<=row.start);if(lane<0)lane=lanes.length;lanes[lane]=Math.max(row.end,row.start+30);row.lane=lane;}for(const row of group)row.columns=lanes.length;};
 for(const row of rows){if(group.length&&row.start>=until){finish();group=[];}group.push(row);until=Math.max(group.length===1?0:until,row.end,row.start+30);}finish();return rows;
}
export function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='1900-01-01'&&s<='2199-12-31'&&Number.isFinite(dateUTC(s).getTime())&&dateUTC(s).toISOString().slice(0,10)===s;}
export function eventPayload(input){
 const out={id:input.id,title:String(input.title||'').trim(),person:String(input.person||'').trim(),category:input.category,starts_on:input.starts_on,ends_on:input.ends_on,all_day:input.all_day===true,start_time:input.all_day?null:input.start_time?.slice(0,5),end_time:input.all_day?null:input.end_time?.slice(0,5),location:String(input.location||'').trim(),notes:String(input.notes||'').trim()};
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(out.id))throw Error('일정 식별자가 올바르지 않습니다.');
 if(!out.title||out.title.length>120)throw Error('일정 제목을 120자 이내로 입력하세요.');
 if(!CATEGORIES[out.category]||out.person.length>40||out.location.length>200||out.notes.length>2000)throw Error('일정 내용을 입력 범위 안에서 확인하세요.');
 if(!validDate(out.starts_on)||!validDate(out.ends_on)||out.ends_on<out.starts_on)throw Error('종료 날짜는 시작 날짜와 같거나 이후여야 합니다.');
 if(!out.all_day&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(out.start_time||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(out.end_time||'')||out.ends_on+'T'+out.end_time<=out.starts_on+'T'+out.start_time))throw Error('종료 시간을 시작 시간 이후로 선택하세요.');
 return out;
}
export function sortEvents(a,b){return a.starts_on.localeCompare(b.starts_on)||Number(b.all_day)-Number(a.all_day)||(a.start_time||'').localeCompare(b.start_time||'')||a.id.localeCompare(b.id);}
export class CalendarStore{
 constructor({calendarId,fetcher=globalThis.fetch?.bind(globalThis),url=SHARED_MODEL_URL.replace('/robot_shared_model','/family_calendar_events'),key=SHARED_MODEL_KEY}={}){if(!/^[0-9a-f-]{36}$/i.test(calendarId||''))throw Error('가족 달력 링크를 확인하세요.');Object.assign(this,{calendarId:calendarId.toLowerCase(),fetcher,url,key});}
 async request(query,options={}){const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);try{const r=await this.fetcher(this.url+query,{cache:'no-store',credentials:'omit',...options,headers:{apikey:this.key,'x-client-info':'mydesk-calendar/'+this.calendarId,Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},signal:c.signal});if(!r.ok)throw Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');return r.status===204?[]:await r.json();}finally{clearTimeout(timer);}}
 async list(start,end){const all=[];for(let offset=0;;offset+=500){const params=new URLSearchParams({select:'*',calendar_id:'eq.'+this.calendarId,starts_on:'lte.'+end,ends_on:'gte.'+start,order:'starts_on.asc,start_time.asc.nullsfirst,id.asc',limit:'500',offset:String(offset)}),rows=await this.request('?'+params);all.push(...rows);if(rows.length<500)return all.map(row=>({...row,...eventPayload(row)})).sort(sortEvents);}}
 async save(input){const event=eventPayload(input);const rows=await this.request('?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({...event,calendar_id:this.calendarId})});return {...rows[0],...event};}
 async remove(id){if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('일정을 찾을 수 없습니다.');await this.request('?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}});}
}
