import {Worker as NativeWorker} from 'node:worker_threads';import assert from 'node:assert/strict';
const elements=new Map(),events={},windowEvents={},raf=new Map(),storage=new Map(),workers=[];let rafId=0;
const defaults={'rb-stage':'balance','rb-focus':'balance','rb-count':'100','rb-interval':'20','rb-source':'best','rb-gesture':'pan','rb-strength':'5','rb-duration':'0','rb-direction':'0','rb-location':'torso'};
function el(id){if(elements.has(id))return elements.get(id);const e={id,value:defaults[id]??'',checked:false,disabled:false,hidden:false,textContent:'',innerHTML:'',style:{},dataset:{},attrs:{},listeners:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=String(v)},addEventListener(k,v){this.listeners[k]=v},getBoundingClientRect(){return {width:600,height:350,left:0,top:0}},getContext(){return new Proxy({}, {get:()=> (...args)=>{assert.ok(args.every(v=>typeof v!=='number'||Number.isFinite(v)),'finite canvas coordinates')}})},append(){},setPointerCapture(){},setCustomValidity(v){this.validation=v},reportValidity(){this.reported=true},blur(){},click(){},focus(){}};elements.set(id,e);return e}
const tabs=['learn','push','joints'].map(k=>{const e=el('tab-'+k);e.dataset.rbTab=k;return e});
globalThis.document={hidden:false,getElementById:el,querySelectorAll:()=>tabs,createElement:tag=>el('new-'+tag+'-'+Math.random()),createTextNode:s=>({textContent:s}),addEventListener(k,v){events[k]=v}};
globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:true}),addEventListener(k,v){windowEvents[k]=v}};
globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.requestAnimationFrame=fn=>{raf.set(++rafId,fn);return rafId};globalThis.cancelAnimationFrame=id=>raf.delete(id);
globalThis.Worker=class{constructor(){this.ready=false;this.queue=[];this.native=new NativeWorker(new URL('./robot-worker-harness.mjs',import.meta.url));workers.push(this);this.native.on('message',data=>{if(data.type==='wrapper-ready'){this.ready=true;for(const d of this.queue)this.native.postMessage(d);this.queue=[]}else this.onmessage?.({data})});this.native.on('error',()=>this.onerror?.())}postMessage(data){this.ready?this.native.postMessage(data):this.queue.push(data)}terminate(){return this.native.terminate()}};
globalThis.location={hash:'',origin:'https://younghuni0117-cloud.github.io',pathname:'/mydesk/robot.html',search:''};globalThis.history={replaceState(){}};
let exported;URL.createObjectURL=blob=>{exported=blob;return 'blob:robot-test'};URL.revokeObjectURL=()=>{};
const wait=async predicate=>{const start=Date.now();while(Date.now()-start<25000){if(predicate())return;await new Promise(r=>setTimeout(r,10))}throw Error('UI condition timeout: '+el('rb-status').textContent)};
let clock=0;function tick(n=1){for(let i=0;i<n;i++){clock+=50;const callbacks=[...raf.values()];raf.clear();callbacks.forEach(fn=>fn(clock))}}
try{
 await import('../robot.js?uitest2');await wait(()=>!el('rb-train').disabled);tick(5);assert.match(el('rb-view-label').textContent,/공통 모델/);
 const initial=JSON.parse(storage.get('mydesk.robot.v2')).model;assert.equal(initial.version,2);assert.equal(Object.keys(initial.abilities).length,5);
 el('rb-count').value='100000';el('rb-focus').value='walk';el('rb-train').onclick();await wait(()=>el('rb-status').textContent.includes('학습 2/100,000'));el('rb-train').onclick();await wait(()=>el('rb-status').textContent.includes('학습 중지'));
 const saved=JSON.parse(storage.get('mydesk.robot.v2')).model;assert.ok(saved.attempts>=2&&saved.attempts<100000);assert.equal(saved.taskAttempts.walk,saved.attempts);assert.equal(saved.taskAttempts.balance,0);
 const weights=[...saved.weights];el('rb-stage').value='recover';el('rb-stage').onchange();await new Promise(r=>setTimeout(r,300));assert.deepEqual(JSON.parse(storage.get('mydesk.robot.v2')).model.weights,weights);
 el('rb-run').onclick();tick(20);assert.match(el('rb-view-label').textContent,/실시간/);el('rb-push').onclick();assert.match(el('rb-status').textContent,/5.0N·s/);tick(25);
 el('rb-zoom-in').onclick();assert.equal(el('rb-zoom-value').textContent,'120%');el('rb-zoom-out').onclick();assert.equal(el('rb-zoom-value').textContent,'100%');el('rb-fit').onclick();tick(2);
 el('rb-canvas').listeners.wheel({preventDefault(){},deltaY:-400});assert.ok(Number(el('rb-zoom-value').textContent.slice(0,-1))>100);tick(2);
 const c=el('rb-canvas');c.listeners.pointerdown({pointerId:1,clientX:100,clientY:100});c.listeners.pointerdown({pointerId:2,clientX:200,clientY:100});c.listeners.pointermove({pointerId:2,clientX:250,clientY:100});tick(2);c.listeners.pointerup({type:'pointerup',pointerId:1,clientX:100,clientY:100});c.listeners.pointerup({type:'pointerup',pointerId:2,clientX:250,clientY:100});
 el('rb-export').onclick();const data=JSON.parse(await exported.text());assert.equal(data.format,'mydesk-robot-v2');assert.deepEqual(data.model.weights,weights);
 await el('rb-import').onchange({target:{files:[{size:exported.size,text:()=>exported.text()}],value:'model.json'}});await wait(()=>!el('rb-train').disabled);assert.equal(JSON.parse(storage.get('mydesk.robot.v2')).model.attempts,saved.attempts);
 el('rb-count').value='100';el('rb-train').onclick();await wait(()=>el('rb-status').textContent.includes('학습 2/100'));document.hidden=true;events.visibilitychange();await wait(()=>el('rb-status').textContent.includes('학습 중지'));
 assert.match(el('rb-sync-open').textContent,/로그인 전/);assert.equal(el('rb-login-form').hidden,false);
 console.log('PASS real worker UI: 100000 target without clamp, cancellation, shared policy across goals, five abilities, live physics, pushes, zoom, pinch, file roundtrip, background stop, honest cloud state');
}finally{await Promise.all(workers.map(w=>w.terminate()))}
