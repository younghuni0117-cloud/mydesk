import {drawRobotSkin} from './robot-skin.mjs?v=robot6';
import {traceFrame,interpolateFrame,chartDomain} from './robot-view.mjs?v=robot6';
import {RobotWorld,STAGES,POLICY_SIZE,DT,robotGeometry,clamp} from './robot-core.mjs?v=robot6';
import {RobotLearner,ALLOWED_ATTEMPTS} from './robot-learning.mjs?v=robot6';
const get=id=>document.getElementById(`rb-${id}`),canvas=get('canvas'),ctx=canvas.getContext('2d');
const storageKey='mydesk.robot.v2';let cache={};
try{cache=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{}
let model=RobotLearner.valid(cache.model)?cache.model:null;
let skin='explorer';try{const saved=localStorage.getItem('mydesk.robot.skin');if(['explorer','tin','space'].includes(saved))skin=saved;}catch{}
let stage='balance',training=false,initializing=true;
let mode='trace',scene=null,pendingScene=null,traceTime=0,viewPaused=false,live=null,liveWeights=Array(POLICY_SIZE).fill(0),geometry=null;
let previousLive=null,currentLive=null,lastPersist=0,lastProgressHud=0;
let lastTime=0,accumulator=0,frame=null,lastHud=0,lastDraw=0,pushArrow=null,drag=null;
let zoom=1,panX=0,panY=0,follow=true,drawScale=100,cameraX=0;const pointers=new Map();let pinch=null;
const status=text=>{get('status').textContent=text},signed=n=>(n>0?'+':'')+n.toFixed(1);
function persist(){try{localStorage.setItem(storageKey,JSON.stringify({model}));}catch{get('storage-note').textContent='브라우저 저장 공간이 부족합니다. 모델 파일을 저장하세요.';}}
function backup(){if(model)try{localStorage.setItem('mydesk.robot.backup',JSON.stringify({model}));}catch{}}
function progress(completed,target,label){const ratio=target?Math.min(100,completed/target*100):0;get('progress').value=ratio;get('progress').textContent=Math.round(ratio)+'%';get('progress-label').textContent=target?`${label} · ${completed.toLocaleString()} / ${target.toLocaleString()}회 (${Math.round(ratio)}%)`:'대기 중 · 0 / 0회';}
function controls(){get('train').disabled=initializing;get('run').disabled=initializing;get('push').disabled=initializing;get('preview').disabled=initializing;get('train').textContent=training?'Ⅱ 학습 중지':'학습 시작';get('count').disabled=training||initializing;get('focus').disabled=training||initializing;get('pause-view').textContent=viewPaused?'▶':'Ⅱ';}
for(const id of ['focus'])for(const [value,s]of Object.entries(STAGES)){const o=document.createElement('option');o.value=value;o.textContent=s.label;get(id).append(o);}
for(const value of ALLOWED_ATTEMPTS){const o=document.createElement('option');o.value=String(value);o.textContent=value.toLocaleString()+'회';get('count').append(o);}
const cells={};for(const [key,s]of Object.entries(STAGES)){const row=document.createElement('tr'),title=document.createElement('th');title.scope='row';title.textContent=s.label.replace('넘어졌다 ','').replace('빠르게 달리기','달리기');row.append(title);cells[key]=[];for(let i=0;i<3;i++){const cell=document.createElement('td');cell.textContent='—';row.append(cell);cells[key].push(cell);}get('abilities').append(row);}
function renderModel(){if(!model)return;for(const [key,a]of Object.entries(model.abilities)){cells[key][0].textContent=model.taskAttempts[key].toLocaleString();cells[key][1].textContent=signed(a.meanReward);cells[key][2].textContent=Math.round(a.passRate*100)+'%';cells[key][2].title=a.cases.map(c=>c.label+': '+(c.passed?'통과':'미통과')).join('\n');}
 const rows=model.history,[min,max]=chartDomain(rows),start=rows[0]?.attempts||0,end=rows.at(-1)?.attempts||0;
 for(const [id,k]of [['chart-best','overall'],['chart-current','candidate']])get(id).setAttribute('d',rows.map((r,i)=>`${i?'L':'M'}${end===start?0:(r.attempts-start)/(end-start)*300} ${95-(r[k]-min)/Math.max(.01,max-min)*90}`).join(' '));
 get('y-max').textContent=max.toFixed(1);get('y-mid').textContent=((max+min)/2).toFixed(1);get('y-min').textContent=min.toFixed(1);get('chart-min').textContent=min.toFixed(1);get('chart-max').textContent=max.toFixed(1);get('chart-range').textContent=`${start}~${end}회`;get('chart-svg').setAttribute('aria-label',`공통 모델 ${model.policyVersion}, 전체 보상 지수 ${rows.at(-1)?.overall.toFixed(1)}. 파란선 보존 모델, 점선 후보.`);
}
const worker=new Worker(new URL('./robot-worker.mjs?v=robot6',import.meta.url),{type:'module'});
function configure(saved=model,legacy=null,legacyCounts=null){initializing=true;training=false;mode='trace';live=null;scene=null;pendingScene=null;traceTime=0;viewPaused=false;const initial=new RobotWorld(stage,{seed:31,disturbances:false});geometry=robotGeometry(initial);scene={trace:[initial.snapshot()],...geometry,obstacles:initial.obstacles};controls();worker.postMessage({type:'init',stage,focus:stage,saved,legacy,legacyCounts});}
function settings(){worker.postMessage({type:'settings',interval:Number(get('interval').value),source:get('source').value,light:get('light').checked});}
worker.onmessage=({data})=>{
 if(data.type==='model'){if(!RobotLearner.valid(data.model)){status('모델 데이터 검증 실패');return;}model=data.model;renderModel();persist();return;}
 if(data.type==='ready'){initializing=false;controls();status('공통 모델 준비 완료 · 실행 과제를 바꿔도 학습된 운동 능력을 함께 사용합니다.');return;}
 if(data.type==='training'){training=data.active;controls();return;}
 if(data.type==='progress'){progress(data.completed,data.target,'학습 중');if(model){model.attempts=data.attempts;model.taskAttempts=data.taskAttempts;if(Date.now()-lastProgressHud>250){for(const k of Object.keys(STAGES))cells[k][0].textContent=model.taskAttempts[k].toLocaleString();lastProgressHud=Date.now();}if(Date.now()-lastPersist>1000){persist();lastPersist=Date.now();}}const minutes=Math.ceil(data.remainingMs/60000);status(`학습 ${data.completed.toLocaleString()}/${data.target.toLocaleString()}회 · 보상 ${signed(data.score)} · 예상 남은 시간 ${minutes}분`);return;}
 if(data.type==='preview'){if(data.stage!==stage)return;pendingScene=data;if(mode==='trace'&&!viewPaused)applyPreview();return;}
 if(data.type==='done'){progress(data.completed,data.target,data.cancelled?'중지':'완료');training=false;controls();status(`${data.cancelled?'학습 중지':'학습 완료'} · ${data.completed.toLocaleString()}/${data.target.toLocaleString()}회 · 같은 로봇으로 다른 운동도 시험해 보세요.`);return;}
 if(data.type==='error'){training=false;initializing=false;controls();status(data.message);}
};
worker.onerror=()=>{training=false;initializing=true;controls();status('학습 스레드 오류입니다. 저장된 모델을 유지합니다. 새로고침해 주세요.');};
function applyPreview(){if(!pendingScene)return;scene={...pendingScene.scene,observedAttempts:pendingScene.attempts,observedSource:pendingScene.source,policyVersion:pendingScene.policyVersion};geometry={parts:scene.parts,joints:scene.joints};traceTime=0;pendingScene=null;}
get('focus').onchange=()=>{stage=get('focus').value;mode='trace';viewPaused=false;scene=null;live=null;worker.postMessage({type:'goal',stage});controls();status(`${STAGES[stage].label} · 같은 로봇으로 관찰합니다.`);pendingScene=null;traceTime=0;get('view-label').textContent=STAGES[stage].label+' 준비 중';};
get('train').onclick=()=>{if(training){worker.postMessage({type:'stop'});status('현재 시도를 마치고 저장합니다.');return;}const count=Number(get('count').value);if(!ALLOWED_ATTEMPTS.includes(count))return;progress(0,count,'시작');training=true;mode='trace';viewPaused=false;controls();worker.postMessage({type:'train',count,focus:get('focus').value});};
for(const id of ['interval','source','light'])get(id).onchange=()=>{settings();if(id==='source')worker.postMessage({type:'preview'});};
function startLive(){live=new RobotWorld(stage,{seed:17,disturbances:false});previousLive=currentLive=live.snapshot();liveWeights=model?[...model.weights]:Array(POLICY_SIZE).fill(0);geometry=robotGeometry(live);mode='live';viewPaused=false;accumulator=0;status(`공통 모델 v${model?.policyVersion||0} · ${STAGES[stage].label} 실시간 시험`);controls();}
get('run').onclick=startLive;
get('preview').onclick=()=>{mode='trace';viewPaused=false;if(pendingScene)applyPreview();else worker.postMessage({type:'preview'});controls();};
get('pause-view').onclick=()=>{viewPaused=!viewPaused;if(!viewPaused&&mode==='trace')applyPreview();controls();};
function strengthLabel(){get('strength-value').textContent=`${get('strength').value} ${Number(get('duration').value)?'N':'N·s'}`;}
get('strength').oninput=strengthLabel;get('duration').onchange=strengthLabel;
function push(direction=Number(get('direction').value),factor=1){if(initializing)return;if(mode!=='live'||!live||live.done)startLive();const strength=Number(get('strength').value)*factor,duration=Number(get('duration').value),location=get('location').value;live.push(strength,direction,location,duration);viewPaused=false;const body=live.parts[location]||live.parts.torso;pushArrow={x:body.getPosition().x,y:body.getPosition().y,angle:direction*Math.PI/180,strength,remaining:1.1};status(`${strength.toFixed(1)}${duration?'N 힘':'N·s 충격'} · 보조 없이 회복 반응을 관찰합니다.`);controls();}
get('push').onclick=()=>push();
function setZoom(value){zoom=clamp(value,.5,2.5);get('zoom-value').textContent=Math.round(zoom*100)+'%';}
get('zoom-in').onclick=()=>setZoom(zoom*1.2);get('zoom-out').onclick=()=>setZoom(zoom/1.2);get('fit').onclick=()=>{setZoom(1);panX=panY=0;follow=true;};
canvas.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom*Math.exp(-e.deltaY*.001));},{passive:false});
canvas.addEventListener('pointerdown',e=>{if(get('gesture').value!=='scroll')canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const[a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom};drag=null;}else if(pointers.size===1)drag={id:e.pointerId,x:e.clientX,y:e.clientY,endX:e.clientX,endY:e.clientY};});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const prev=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2&&pinch){const[a,b]=[...pointers.values()];setZoom(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance));return;}if(drag&&get('gesture').value!=='scroll'){drag.endX=e.clientX;drag.endY=e.clientY;if(get('gesture').value==='pan'){if(follow){const data=sourceFrame();panX=cameraX;follow=false;}panX-=(e.clientX-prev.x)/drawScale;panY+=(e.clientY-prev.y)/drawScale;}}});
function release(e){if(drag&&drag.id===e.pointerId&&get('gesture').value==='push'&&e.type==='pointerup'){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>8)push(Math.atan2(-dy,dx)*180/Math.PI,clamp(Math.hypot(dx,dy)/90,.2,1));}pointers.delete(e.pointerId);drag=null;pinch=null;}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
get('gesture').onchange=()=>{canvas.style.touchAction=get('gesture').value==='scroll'?'pan-y':'none';};
function sourceFrame(){
 if(mode==='live'&&live)return {frame:interpolateFrame(previousLive,currentLive,accumulator/DT),meta:{...geometry,obstacles:live.obstacles}};
 if(!scene?.trace?.length)return null;
 const duration=scene.metrics?.time||STAGES[stage].duration,t=traceTime%duration,frames=scene.trace;
 return {frame:traceFrame(frames,t),meta:scene};
}
function draw(data){
 const rect=canvas.getBoundingClientRect(),ratio=Math.min(window.matchMedia('(pointer: coarse)').matches?1.5:2,window.devicePixelRatio||1),w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}ctx.setTransform(ratio,0,0,ratio,0,0);const W=w/ratio,H=h/ratio;ctx.clearRect(0,0,W,H);if(!data)return;
 const {frame,meta}=data,maxY=Math.max(1,...frame.parts.map((p,i)=>p[1]+(meta.parts[i].circle?meta.parts[i].w:Math.hypot(meta.parts[i].w,meta.parts[i].h)/2))),scale=Math.min(H/2.4,W/3.3,H*.78/maxY)*zoom,ground=H*.88+panY*scale,root=frame.parts[0],camera=follow?root[0]+(['balance','recover'].includes(stage)?0:.55):panX;drawScale=scale;cameraX=camera;
 const X=x=>W/2+(x-camera)*scale,Y=y=>ground-y*scale;
 ctx.strokeStyle='#dce5f0';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,ground);ctx.lineTo(W,ground);ctx.stroke();ctx.fillStyle='#e5ebf3';ctx.fillRect(0,ground,W,H-ground);
 ctx.fillStyle='#a4b2c4';ctx.font='9px sans-serif';ctx.textAlign='center';
 for(let x=Math.floor(camera-W/scale/2);x<camera+W/scale/2+1;x++){ctx.beginPath();ctx.moveTo(X(x),ground);ctx.lineTo(X(x),ground+5);ctx.stroke();ctx.fillText(`${x}m`,X(x),ground+17)}
 for(const o of meta.obstacles||[]){ctx.fillStyle='#c2ccda';ctx.fillRect(X(o.x-o.width/2),Y(o.height),o.width*scale,o.height*scale);ctx.fillStyle='#95a6be';ctx.fillRect(X(o.x-o.width/2),Y(o.height),o.width*scale,3)}
 drawRobotSkin(ctx,meta.parts,frame.parts,X,Y,scale,skin);
 if(pushArrow){const a=pushArrow,dx=Math.cos(a.angle)*(.3+a.strength/25)*scale,dy=-Math.sin(a.angle)*(.3+a.strength/25)*scale,x=X(a.x),y=Y(a.y);ctx.strokeStyle='#bf875c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.stroke();ctx.beginPath();const angle=Math.atan2(dy,dx);ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx-10*Math.cos(angle-.45),y+dy-10*Math.sin(angle-.45));ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx-10*Math.cos(angle+.45),y+dy-10*Math.sin(angle+.45));ctx.stroke();}
 if(drag&&get('gesture').value==='push'){ctx.strokeStyle='#b38d68';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(drag.x-rect.left,drag.y-rect.top);ctx.lineTo(drag.endX-rect.left,drag.endY-rect.top);ctx.stroke();}
}
function hud(data){if(!data)return;const m=data.frame.metrics;get('time').innerHTML=`${m.time.toFixed(1)}<small>초</small>`;get('distance').innerHTML=`${signed(m.distance)}<small>m</small>`;get('speed').innerHTML=`${m.speed.toFixed(1)}<small>m/s</small>`;get('events').textContent=`${m.recoveries} / ${m.passed}`;
 const observed=scene?.observedAttempts||0,source=scene?.observedSource==='candidate'?'최근 후보':'공통 모델';get('view-label').textContent=mode==='live'?`${STAGES[stage].label} · 실시간 · v${model?.policyVersion||0} · ${m.recovering?'회복 시도':'균형·이동 제어'}`:`${STAGES[stage].label} · ${source} v${scene?.policyVersion||0} · ${observed}회 시점 재생`;
}

function animate(time){
 lastDraw=time;
 const dt=lastTime?Math.min(.05,(time-lastTime)/1000):0;lastTime=time;
 if(!viewPaused){if(mode==='live'&&live&&!live.done){accumulator+=dt;while(accumulator>=DT&&!live.done){previousLive=currentLive;live.step(liveWeights);currentLive=live.snapshot();accumulator-=DT;}if(live.done){viewPaused=true;controls();status(`실시간 시험 종료 · 이동 ${live.metrics().distance.toFixed(2)}m, 회복 ${live.recoveries}회, 통과 ${live.passed.size}개. 모델 실행을 누르면 다시 시작합니다.`);}}else if(mode==='trace')traceTime+=dt;if(pushArrow){pushArrow.remaining-=dt;if(pushArrow.remaining<=0)pushArrow=null;}}
 const data=sourceFrame();draw(data);if(time-lastHud>140){hud(data);lastHud=time;}
 frame=requestAnimationFrame(animate);
}
frame=requestAnimationFrame(animate);

get('export').onclick=()=>{const blob=new Blob([JSON.stringify({format:'mydesk-robot-v2',model},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mydesk-robot-model.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
get('import').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>2*1024*1024)throw Error('모델 파일은 2MB 이하여야 합니다.');const data=JSON.parse(await file.text());if(data.format!=='mydesk-robot-v2'||!RobotLearner.valid(data.model))throw Error('올바른 v2 공통 모델 파일이 아닙니다.');backup();model=data.model;configure(model);status('모델을 불러와 무보조 성능을 다시 확인합니다.');}catch(e){status(e.message);}finally{event.target.value='';}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){worker.postMessage({type:'stop'});viewPaused=true;controls();}});
document.addEventListener('game:help-open',()=>{viewPaused=true;controls();});
window.addEventListener('pagehide',()=>{worker.postMessage({type:'stop'});viewPaused=true;persist();});
let legacy=null,legacyCounts=null;
if(!model)try{const old=JSON.parse(localStorage.getItem('mydesk.robot.v1')||'{}'),valid=Object.entries(old).filter(([k,m])=>/^(balance|recover|walk|run|obstacles)-(0|30|60)$/.test(k)&&Array.isArray(m?.weights)&&m.weights.length===32&&m.weights.every(v=>Number.isFinite(v)&&Math.abs(v)<20));legacy=valid.sort((a,b)=>(b[1].bestReward||0)-(a[1].bestReward||0)).slice(0,3).map(([,v])=>v);legacyCounts=Object.fromEntries(Object.keys(STAGES).map(k=>[k,valid.filter(([name])=>name.startsWith(k+'-')).reduce((s,[,m])=>s+(Number.isSafeInteger(m.attempts)&&m.attempts>0&&m.attempts<1e10?m.attempts:0),0)]));}catch{}
function selectSkin(value){skin=value;for(const button of document.querySelectorAll('[data-rb-skin]'))button.setAttribute('aria-pressed',String(button.dataset.rbSkin===skin));try{localStorage.setItem('mydesk.robot.skin',skin);}catch{}}
for(const button of document.querySelectorAll('[data-rb-skin]'))button.onclick=()=>selectSkin(button.dataset.rbSkin);
selectSkin(skin);progress(0,0,'대기');
get('light').checked=window.matchMedia('(pointer: coarse)').matches;
settings();configure(model,legacy,legacyCounts);
// Retire the former website login locally; no server requests are made.
try{localStorage.removeItem('mydesk.robot.auth');}catch{}
