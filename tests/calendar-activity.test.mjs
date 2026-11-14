import test from 'node:test';import assert from 'node:assert/strict';
import {CalendarReceipts,upcomingEvents,countdown,changeDiff} from '../calendar-activity.mjs';
import {eventTargets,eventPayload,targetLabel,matchesTargets} from '../calendar-data.mjs';
const event={id:'663694dd-db35-457f-8f4a-595658e97c00',title:'가족 약속',category:'family',starts_on:'2026-11-14',ends_on:'2026-11-14',all_day:false,start_time:'10:00',end_time:'11:00',notes:''};
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
test('legacy categories map to targets and partial shared events remain single events',()=>{
 assert.deepEqual(eventTargets(event),['personal','school','medical','other']);assert.deepEqual(eventTargets({...event,category:'school'}),['school']);const shared=eventPayload({...event,targets:['school','personal','personal']});assert.deepEqual(shared.targets,['personal','school']);assert.equal(shared.category,'family');assert.equal(targetLabel(shared),'영훈 · 서정');assert.equal(matchesTargets(shared,new Set(['school'])),true);assert.equal(matchesTargets(shared,new Set(['medical'])),false);assert.throws(()=>eventPayload({...event,targets:[]}),/한 명 이상/);assert.throws(()=>eventPayload({...event,targets:['unknown']}));
});
test('upcoming excludes ended times, preserves ongoing and future months, and uses Seoul D-days',()=>{
 const now=new Date('2026-11-14T01:30:00Z'),past={...event,id:'past',end_time:'10:00'},ongoing={...event,id:'ongoing'},later={...event,id:'later',start_time:'13:00',end_time:'14:00'},future={...event,id:'future',starts_on:'2026-11-19',ends_on:'2026-11-19'},nextMonth={...event,id:'next',starts_on:'2026-12-01',ends_on:'2026-12-01'},yesterdayAllDay={...event,id:'all-past',all_day:true,starts_on:'2026-11-13',ends_on:'2026-11-13'};
 assert.deepEqual(upcomingEvents([nextMonth,future,past,later,yesterdayAllDay,ongoing],now).map(e=>e.id),['ongoing','later','future','next']);assert.equal(countdown(future,now),'D-5');assert.equal(countdown(later,now),'오늘');assert.equal(countdown(ongoing,now),'진행 중');assert.equal(countdown({...event,all_day:true},now),'오늘');assert.equal(countdown({...event,starts_on:'2026-11-15'},new Date('2026-11-14T15:01:00Z')),'오늘');
});
test('old rows are a silent baseline, while receipts are per device and per calendar',()=>{
 const a=new CalendarReceipts('family-a',storage()),b=new CalendarReceipts('family-a',storage()),source=storage(),c=new CalendarReceipts('family-a',source),other=new CalendarReceipts('family-b',source),created={...event,change_revision:1,change_kind:'new',changed_at:'2026-11-14T01:00:00Z'};
 assert.equal(a.unread([{...event,change_revision:0}]).length,0);assert.equal(a.unread([created]).length,1);assert.equal(a.acknowledge([created]),true);assert.equal(a.unread([created]).length,0);assert.equal(b.unread([created]).length,1);c.acknowledge([created]);assert.equal(new CalendarReceipts('family-a',source).unread([created]).length,0);assert.equal(other.unread([created]).length,1);
});
test('updated events reappear once with latest content and diff against last confirmed snapshot',()=>{
 const s=storage(),receipts=new CalendarReceipts('family-a',s),v1={...event,change_revision:1,change_kind:'new'},v2={...v1,title:'두 번째 제목',change_revision:2,change_kind:'updated',previous_values:event},v3={...v2,title:'최종 제목',change_revision:3,previous_values:v2};receipts.acknowledge([v1]);const unread=receipts.unread([v2,v3]);assert.equal(unread.length,1);assert.equal(unread[0].title,'최종 제목');assert.deepEqual(changeDiff(receipts.before(v3),v3),[{label:'제목',before:'가족 약속',after:'최종 제목'}]);receipts.acknowledge([v2]);assert.equal(receipts.unread([v3]).length,1);receipts.acknowledge([v3]);receipts.acknowledge([v1]);assert.equal(receipts.unread([v3]).length,0);
});
test('storage failure preserves confirmation for the current page without pretending it persisted',()=>{
 const r=new CalendarReceipts('family-a',{getItem:()=>null,setItem:()=>{throw Error('quota');}}),e={...event,change_revision:1,change_kind:'new'};assert.equal(r.acknowledge([e]),false);assert.equal(r.unread([e]).length,0);
});
