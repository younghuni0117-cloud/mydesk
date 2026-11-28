import test from 'node:test';import assert from 'node:assert/strict';
import {newNote,validNote,boardPoint,zoomAt,changeStatus,createdDate,textStyle} from '../sticky-data.mjs';
import {NoteStorage} from '../sticky-storage.mjs';
test('note creation avoids exact overlap and preserves date, logical coordinates and independent state',()=>{
 const n=newNote([],{x:50,y:70},'2026-11-28T00:00:00.000Z'),b=newNote([n],{x:50,y:70});assert.ok(validNote(n));assert.notEqual(b.x,n.x);assert.equal(createdDate(n),'2026.11.28');assert.equal(changeStatus(n,'archived').createdAt,n.createdAt);assert.equal(n.status,'active');assert.equal(changeStatus(n,'trashed').status,'trashed');assert.ok(!validNote({...n,width:10}));
});
test('zoom preserves anchor in logical space, including panned and resized viewports',()=>{
 const view={x:30,y:-20,z:.8},point={x:300,y:200},rect={left:0,top:0},before=boardPoint(point,rect,view),after=boardPoint(point,rect,zoomAt(view,1.7,point));assert.ok(Math.abs(before.x-after.x)<1e-10);assert.ok(Math.abs(before.y-after.y)<1e-10);
});
function fixture(){const remote=new Map(),saved=new Map();let offline=false;
 const fetcher=async(url,{body})=>{if(offline)throw Error('offline');const {change,expected_revision}=JSON.parse(body);if(!change)return {ok:true,json:async()=>({ok:true,notes:[...remote.values()]})};const old=remote.get(change.id),revision=old?.revision??0;if(revision!==expected_revision)return {ok:true,json:async()=>({ok:false,conflict:true,record:old??{id:change.id,note:null,revision:0}})};const record={id:change.id,revision:revision+1,note:change.deleted?null:structuredClone(change)};remote.set(change.id,record);return {ok:true,json:async()=>({ok:true,record})};};
 const local={read:async k=>structuredClone(saved.get(k)),write:async(k,v)=>saved.set(k,structuredClone(v))};
 return {remote,local,offline:v=>offline=v,create:()=>new NoteStorage({key:'a'.repeat(43),url:'https://example.test',apiKey:'synthetic',cache:local,fetcher})};
}
test('two devices sync distinct edits, preserve same-note conflicts as copies and restore offline pending edits',async()=>{
 const f=fixture(),a=f.create(),b=f.create();await a.init();await b.init();const n=newNote([],{x:20,y:20});a.queue({...n,text:'first'});await a.flush();await b.poll();assert.equal(b.notes[0].text,'first');
 a.queue({...a.notes[0],text:'device a'});b.queue({...b.notes[0],text:'device b'});await a.flush();await b.flush();await b.flush();assert.ok(b.notes.some(n=>n.text.includes('device b')));assert.equal(b.backups.length,1);await a.poll();assert.equal(a.notes.length,2);
 f.offline(true);a.queue({...a.notes[0],text:'offline work'});await a.flush();assert.equal(a.pending.size,1);await a.chain;const reopened=f.create();await reopened.init();assert.ok(reopened.notes.some(n=>n.text==='offline work'));f.offline(false);await reopened.flush();assert.equal(reopened.pending.size,0);for(const s of [a,b,reopened])clearTimeout(s.timer);
});
test('permanent deletion persists trash first, leaves a tombstone and never revives on polling',async()=>{
 const f=fixture(),s=f.create();await s.init();const n=newNote([],{x:0,y:0});s.queue({...n,status:'trashed'});s.purge(n.id);await s.flush();await s.flush();await s.poll();assert.equal(s.notes.length,0);assert.equal(f.remote.get(n.id).note,null);clearTimeout(s.timer);
});
test('local storage failure does not discard pending content or falsely mark it synchronized',async()=>{
 const s=new NoteStorage({key:'a'.repeat(43),url:'https://example.test',apiKey:'synthetic',cache:{read:async()=>undefined,write:async()=>{throw Error('quota');}},fetcher:async()=>{throw Error('offline');}});await s.init();s.queue(newNote([],{x:0,y:0}));await s.flush();assert.equal(s.failedLocal,true);assert.equal(s.pending.size,1);assert.equal(s.notes.length,1);clearTimeout(s.timer);
});
test('dragging defers server mutation and polling without losing pending changes',async()=>{
 const f=fixture(),s=f.create();await s.init();let dragging=true;s.busy=()=>dragging;
 const n=newNote([],{x:20,y:30});s.queue(n);await s.flush();await s.poll();assert.equal(f.remote.size,0);assert.equal(s.pending.size,1);
 dragging=false;await s.flush();assert.equal(f.remote.size,1);assert.equal(s.pending.size,0);clearTimeout(s.timer);
});
test('formatting is bounded and legacy memo text remains compatible',()=>{
 const n=newNote([],{x:0,y:0});assert.deepEqual(textStyle(n),{bold:false,underline:false,size:18,color:'black'});
 assert.ok(validNote({...n,format:{bold:true,underline:true,size:24,color:'red'}}));
 assert.ok(!validNote({...n,format:{bold:true,underline:false,size:100,color:'red'}}));
 assert.ok(!validNote({...n,format:{bold:false,underline:false,size:18,color:'url(evil)'}}));
});
test('bold underline size and text color survive server save, reload and archive restoration',async()=>{
 const f=fixture(),a=f.create();await a.init();const n={...newNote([],{x:0,y:0}),format:{bold:true,underline:true,size:24,color:'blue'}};
 a.queue(n);await a.flush();const b=f.create();await b.init();assert.deepEqual(b.notes[0].format,n.format);
 b.queue(changeStatus(b.notes[0],'archived'));await b.flush();b.queue(changeStatus(b.notes[0],'active'));await b.flush();await a.poll();assert.deepEqual(a.notes[0].format,n.format);assert.equal(a.notes[0].createdAt,n.createdAt);clearTimeout(a.timer);clearTimeout(b.timer);
});
