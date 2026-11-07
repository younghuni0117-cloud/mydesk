import {drawTerrainScene,terrainArtReady} from './robot-scenery.mjs?v=robot14';
import {RobotTeam} from './robot-team.mjs?v=robot14';
import {TERRAINS,terrainHeight} from './robot-terrain.mjs?v=robot14';
import {drawRobotSkin} from './robot-skin.mjs?v=robot14';
import {traceFrame,interpolateFrame,chartDomain} from './robot-view.mjs?v=robot14';
import {RobotWorld,STAGES,POLICY_SIZE,DT,robotGeometry,clamp} from './robot-core.mjs?v=robot14';
import {RobotLearner,ALLOWED_ATTEMPTS} from './robot-learning.mjs?v=robot14';
const get=id=>document.getElementById(`rb-${id}`),canvas=get('canvas'),ctx=canvas.getContext('2d');
const storageKey='mydesk.robot.v2';let cache={};
try{cache=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{}
let model=RobotLearner.valid(cache.model)?cache.model:null;
let skin='explorer';try{const saved=localStorage.getItem('mydesk.robot.skin');if(['explorer','tin','space','hiker'].includes(saved))skin=saved;}catch{}
let options={terrain:'meadow',view:'terrain',robots:1,observationSeconds:30,interval:20};try{const o=JSON.parse(localStorage.getItem('mydesk.robot.options')||'{}');options={terrain:o.terrain==='rockyhills'?'desert':TERRAINS[o.terrain]?o.terrain:'meadow',view:o.view==='robot'?'robot':'terrain',robots:1,observationSeconds:Number.isInteger(o.observationSeconds)&&o.observationSeconds>=1&&o.observationSeconds<=3600?o.observationSeconds:30,interval:[10,20,50,100].includes(o.interval)?o.interval:20};}catch{}
let liveRobots=[],previousFrames=[],currentFrames=[];
let stage='balance',training=false,initializing=true;
let mode='trace',scene=null,pendingScene=null,traceTime=0,viewPaused=false,live=null,liveWeights=Array(POLICY_SIZE).fill(0),geometry=null;
let viewSource='best',liveSource='best',liveAttempt=0,liveVersion=0,latestPreview=null;
let previousLive=null,currentLive=null,lastPersist=0,lastProgressHud=0;
let lastTime=0,accumulator=0,frame=null,lastHud=0,lastDraw=0,pushArrow=null,drag=null;
let zoom=1,panX=.4,panY=0,follow=options.view==='robot',drawScale=100,cameraX=0;const pointers=new Map();let pinch=null;
const status=text=>{get('status').textContent=text},signed=n=>(n>0?'+':'')+n.toFixed(1);
function persist(){try{localStorage.setItem(storageKey,JSON.stringify({model}));}catch{get('storage-note').textContent='브라우저 저장 공간이 부족합니다. 모델 파일을 저장하세요.';}}
function backup(){if(model)try{localStorage.setItem('mydesk.robot.backup',JSON.stringify({model}));}catch{}}
let lastRequest={completed:0,target:0};
function progress(completed,target,label,total=model?.attempts||0){lastRequest={completed,target};const ratio=target?Math.min(100,completed/target*100):0;get('progress').value=ratio;get('progress').textContent=Math.round(ratio)+'%';get('progress-label').textContent=`학습 ${completed.toLocaleString()}/${target.toLocaleString()}회 (총 ${total.toLocaleString()}회)`;}
function controls(){get('train').disabled=initializing;get('run').disabled=initializing;for(const id of ['terrain'])get(id).disabled=initializing||training;get('preview').disabled=initializing;get('train').textContent=training?'Ⅱ 학습 중지':'학습 시작';get('count').disabled=training||initializing;get('focus').disabled=training||initializing;get('pause-view').textContent=viewPaused?'▶':'Ⅱ';get('run').setAttribute('aria-pressed',String(viewSource==='best'));get('preview').setAttribute('aria-pressed',String(viewSource==='candidate'));}
for(const id of ['focus'])for(const [value,s]of Object.entries(STAGES)){const o=document.createElement('option');o.value=value;o.textContent=s.label;get(id).append(o);}
for(const value of ALLOWED_ATTEMPTS){const o=document.createElement('option');o.value=String(value);o.textContent=value.toLocaleString()+'회';get('count').append(o);}
const cells={};for(const [key,s]of Object.entries(STAGES)){const row=document.createElement('tr'),title=document.createElement('th');title.scope='row';title.textContent=s.label.replace('넘어졌다 ','').replace('빠르게 달리기','달리기');row.append(title);cells[key]=[];for(let i=0;i<3;i++){const cell=document.createElement('td');cell.textContent='—';row.append(cell);cells[key].push(cell);}get('abilities').append(row);}
function renderModel(){if(!model)return;for(const [key,a]of Object.entries(model.abilities)){cells[key][0].textContent=model.taskAttempts[key].toLocaleString();cells[key][1].textContent=signed(a.meanReward);cells[key][2].textContent=Math.round(a.passRate*100)+'%';cells[key][2].title=a.cases.map(c=>c.label+': '+(c.passed?'통과':'미통과')).join('\n');}
 renderChart();
}
function renderChart(){if(!model)return;
 const rows=model.history.filter(r=>Number.isFinite(r.rewards?.[stage])).map(r=>({attempts:r.attempts,overall:r.rewards[stage],candidate:Number.isFinite(r.candidateRewards?.[stage])?r.candidateRewards[stage]:r.rewards[stage]}));
 const current=model.abilities[stage].meanReward,end=model.attempts,values=[...rows,{overall:current,candidate:current}],[min,max]=chartDomain(values),Y=v=>95-(v-min)/(max-min)*90,X=n=>end?n/end*300:0;
 for(const [id,k]of [['chart-best','overall'],['chart-current','candidate']])get(id).setAttribute('d',rows.map((r,i)=>`${i?'L':'M'}${X(r.attempts)} ${Y(r[k])}`).join(' '));
 get('chart-dot').setAttribute('cx',X(end));get('chart-dot').setAttribute('cy',Y(current));
 get('chart-title').textContent=STAGES[stage].label+' · 평균 보상';get('y-max').textContent=max.toFixed(1);get('y-mid').textContent=((max+min)/2).toFixed(1);get('y-min').textContent=min.toFixed(1);get('chart-min').textContent=min.toFixed(1);get('chart-max').textContent=max.toFixed(1);get('chart-range').textContent=`0~${end.toLocaleString()}회`;get('x-mid').textContent=Math.round(end/2).toLocaleString();get('x-max').textContent=end.toLocaleString()+'회';
 get('chart-svg').setAttribute('aria-label',`${STAGES[stage].label} 평균 보상 ${current.toFixed(1)}점. 가로축 0~${end}회. 기록이 있는 평가 시점만 표시합니다.`);
}

const worker=new RobotTeam();
function configure(saved=model,legacy=null,legacyCounts=null){initializing=true;training=false;viewSource='best';latestPreview=null;mode='trace';live=null;scene=null;pendingScene=null;traceTime=0;viewPaused=false;const initial=new RobotWorld(stage,{...options,seed:31,disturbances:false});geometry=robotGeometry(initial);scene={trace:[initial.snapshot()],...geometry,obstacles:initial.obstacles,terrain:initial.terrain};controls();worker.postMessage({type:'init',stage,focus:stage,saved,legacy,legacyCounts,environment:{terrain:options.terrain,courseVersion:7},robotCount:options.robots});}
function settings(){worker.postMessage({type:'settings',interval:options.interval});}
worker.onmessage=({data})=>{
 if(data.type==='model'){if(!RobotLearner.valid(data.model)){status('모델 데이터 검증 실패');return;}model=data.model;renderModel();persist();progress(lastRequest.completed,lastRequest.target,'학습');return;}
 if(data.type==='ready'){initializing=false;if(!live)startLive();controls();status(`${TERRAINS[options.terrain]} · 준비 완료`);return;}
 if(data.type==='training'){training=data.active;controls();return;}
 if(data.type==='progress'){progress(data.completed,data.target,'학습 중',data.attempts);if(model){model.attempts=data.attempts;model.taskAttempts=data.taskAttempts;if(Date.now()-lastProgressHud>250){for(const k of Object.keys(STAGES))cells[k][0].textContent=model.taskAttempts[k].toLocaleString();lastProgressHud=Date.now();renderChart();}if(Date.now()-lastPersist>1000){persist();lastPersist=Date.now();}}const minutes=Math.ceil(data.remainingMs/60000);status(`학습 ${data.completed.toLocaleString()}/${data.target.toLocaleString()}회 (총 ${data.attempts.toLocaleString()}회) · 보상 ${signed(data.score)} · 예상 남은 시간 ${minutes}분`);return;}
 if(data.type==='preview'){if(data.stage!==stage)return;latestPreview=data;if(viewSource==='candidate'&&(!viewPaused||live?.done))showRecent();return;}
 if(data.type==='done'){progress(data.completed,data.target,data.cancelled?'중지':'완료');training=false;controls();status(`${data.cancelled?'학습 중지':'학습 완료'} · ${data.completed.toLocaleString()}/${data.target.toLocaleString()}회 · 같은 로봇으로 다른 운동도 시험해 보세요.`);return;}
 if(data.type==='error'){training=false;initializing=false;controls();status(data.message);}
};
worker.onerror=()=>{training=false;initializing=true;controls();status('학습 스레드 오류입니다. 저장된 모델을 유지합니다. 새로고침해 주세요.');};
get('focus').onchange=()=>{stage=get('focus').value;renderChart();viewSource='best';mode='trace';viewPaused=false;scene=null;live=null;latestPreview=null;worker.postMessage({type:'goal',stage});controls();status(`${STAGES[stage].label} · 같은 로봇으로 관찰합니다.`);pendingScene=null;traceTime=0;get('view-label').textContent=STAGES[stage].label+' 준비 중';};
get('train').onclick=()=>{if(training){worker.postMessage({type:'stop'});status('현재 시도를 마치고 저장합니다.');return;}const count=Number(get('count').value);if(!ALLOWED_ATTEMPTS.includes(count))return;progress(0,count,'시작');training=true;viewSource='candidate';viewPaused=false;latestPreview=null;controls();worker.postMessage({type:'train',count,focus:get('focus').value});};
get('interval').onchange=()=>{options.interval=Number(get('interval').value);saveOptions();settings();};
get('observation-seconds').onchange=()=>{const input=get('observation-seconds'),seconds=Number(input.value);if(!Number.isInteger(seconds)||seconds<1||seconds>3600){input.setCustomValidity('1~3600초 사이의 정수를 입력하세요.');input.reportValidity();return;}input.setCustomValidity('');options.observationSeconds=seconds;saveOptions();if(live)startLive(liveWeights,liveSource,liveAttempt,liveVersion);};
function startLive(weights=model?.weights||Array(POLICY_SIZE).fill(0),source='best',attempt=model?.attempts||0,version=model?.policyVersion||0){liveRobots=Array.from({length:options.robots},(_,i)=>new RobotWorld(stage,{...options,seed:31+i*101,disturbances:false}));live=liveRobots[0];previousFrames=currentFrames=liveRobots.map(w=>w.snapshot());previousLive=currentLive=currentFrames[0];liveWeights=[...weights];liveSource=source;liveAttempt=attempt;liveVersion=version;geometry=robotGeometry(live);mode='live';viewPaused=false;accumulator=0;if(!training)status(`${source==='candidate'?'최근 모델':'통합 모델'} v${version} · ${STAGES[stage].label} · ${options.observationSeconds}초 관찰`);controls();}
function showRecent(){if(latestPreview)startLive(latestPreview.weights,latestPreview.source,latestPreview.attempts,latestPreview.policyVersion);else worker.postMessage({type:'preview'});}
get('run').onclick=()=>{viewSource='best';startLive();};
get('preview').onclick=()=>{viewSource='candidate';viewPaused=false;showRecent();controls();};
get('pause-view').onclick=()=>{viewPaused=!viewPaused;controls();};
function pushAt(direction,factor=1,point=null){if(initializing)return;if(mode!=='live'||!live)startLive();else if(liveRobots.every(w=>w.done))startLive(liveWeights,liveSource,liveAttempt,liveVersion);let index=0;if(point){let best=Infinity;for(let i=0;i<liveRobots.length;i++){const p=liveRobots[i].parts.torso.getPosition(),distance=Math.hypot(p.x+i*3.8-point.x,p.y-point.y);if(distance<best){best=distance;index=i;}}}const robot=liveRobots[index],strength=clamp(factor*8,.5,30);robot.push(strength,direction,'torso');viewPaused=false;const p=robot.parts.torso.getPosition();pushArrow={x:p.x+index*3.8,y:p.y,angle:direction*Math.PI/180,strength,remaining:1.1};status(`로봇 ${index+1} · ${strength.toFixed(1)} N·s 밀기`);controls();}
function setZoom(value){zoom=clamp(value,.04,2.5);get('zoom-value').textContent=Math.round(zoom*100)+'%';}
get('zoom-in').onclick=()=>setZoom(zoom*1.2);get('zoom-out').onclick=()=>setZoom(zoom/1.2);get('fit').onclick=()=>{setZoom(1);panX=.4;panY=0;follow=options.view==='robot';};
canvas.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom*Math.exp(-e.deltaY*.001));},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
let groundPixel=0,terrainDatum=0;
canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')e.preventDefault();canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const[a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2};drag=null;}else if(pointers.size===1){const rect=canvas.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,endX:e.clientX,endY:e.clientY,mode:e.button===2?'pan':'push',point:{x:cameraX+(e.clientX-rect.left-rect.width/2)/drawScale,y:(groundPixel-(e.clientY-rect.top))/drawScale}};}});
function pan(dx,dy){if(follow){panX=cameraX;panY=(groundPixel-canvas.getBoundingClientRect().height*.88)/drawScale-terrainDatum;follow=false;options.view='terrain';get('view').value='terrain';saveOptions();}panX-=dx/drawScale;panY+=dy/drawScale;}
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const prev=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2&&pinch){const[a,b]=[...pointers.values()],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;setZoom(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance));pan(cx-pinch.cx,cy-pinch.cy);pinch.cx=cx;pinch.cy=cy;return;}if(drag){drag.endX=e.clientX;drag.endY=e.clientY;if(drag.mode==='pan')pan(e.clientX-prev.x,e.clientY-prev.y);}});
function release(e){if(drag&&drag.id===e.pointerId&&drag.mode==='push'&&e.type==='pointerup'){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>8)pushAt(Math.atan2(-dy,dx)*180/Math.PI,Math.hypot(dx,dy)/90,drag.point);}pointers.delete(e.pointerId);drag=null;pinch=null;}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
function sourceFrame(){
 if(mode==='live'&&live){const actors=liveRobots.map((w,i)=>({frame:interpolateFrame(previousFrames[i],currentFrames[i],w.done?1:accumulator/DT),meta:{...geometry,obstacles:w.obstacles,terrain:w.terrain},offset:i*3.8}));return {...actors[0],actors};}
 if(!scene?.trace?.length)return null;
 const scenes=scene.teamScenes||[scene],actors=scenes.flatMap((s,i)=>s?.trace?.length?[{frame:traceFrame(s.trace,traceTime%(s.metrics?.time||STAGES[stage].duration)),meta:s,offset:i*3.8}]:[]);
 return actors.length?{...actors[0],actors}:null;
}

function draw(data){
 const rect=canvas.getBoundingClientRect(),ratio=Math.min(window.matchMedia('(pointer: coarse)').matches?1.5:2,window.devicePixelRatio||1),w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}ctx.setTransform(ratio,0,0,ratio,0,0);const W=w/ratio,H=h/ratio;ctx.clearRect(0,0,W,H);if(!data)return;
 const {frame,meta}=data,actors=data.actors||[{frame,meta,offset:0}],root=frame.parts[0],camera=follow?root[0]:panX;
 // Anchor high hills to their starting floor so a tenfold slope does not hide the robot.
 terrainDatum=meta.terrain?.kind==='hills'?terrainHeight(meta.terrain.segments,0):0;
 const datum=follow&&meta.terrain?.kind==='hills'?terrainHeight(meta.terrain.segments,root[0]):terrainDatum;
 const relief=Math.max(0,...(meta.terrain?.segments||[]).filter(s=>s.x1>camera-2/zoom&&s.x0<camera+2/zoom).flatMap(s=>[s.y0-datum,s.y1-datum]));
 const scale=Math.min(H/(2.6+relief*1.2),W/3.3)*zoom,ground=(follow?H*.5+(root[1]-.1)*scale:H*.88+terrainDatum*scale)+panY*scale;drawScale=scale;cameraX=camera;groundPixel=ground;
 const X=x=>W/2+(x-camera)*scale,Y=y=>ground-y*scale;
 drawTerrainScene(ctx,{W,H,scale,camera,ground,terrain:meta.terrain,obstacles:meta.obstacles||[],X,Y});
 for(const actor of actors){const Xlocal=x=>X(x+actor.offset);drawRobotSkin(ctx,actor.meta.parts,actor.frame.parts,Xlocal,Y,scale,skin);}
 if(pushArrow){const a=pushArrow,dx=Math.cos(a.angle)*(.3+a.strength/25)*scale,dy=-Math.sin(a.angle)*(.3+a.strength/25)*scale,x=X(a.x),y=Y(a.y);ctx.strokeStyle='#bf875c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.stroke();ctx.beginPath();const angle=Math.atan2(dy,dx);ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx-10*Math.cos(angle-.45),y+dy-10*Math.sin(angle-.45));ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx-10*Math.cos(angle+.45),y+dy-10*Math.sin(angle+.45));ctx.stroke();}
 if(drag&&drag.mode==='push'){ctx.strokeStyle='#b38d68';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(drag.x-rect.left,drag.y-rect.top);ctx.lineTo(drag.endX-rect.left,drag.endY-rect.top);ctx.stroke();}
}
function hud(data){if(!data)return;const m=data.frame.metrics;get('time').innerHTML=`${m.time.toFixed(1)}<small>초</small>`;get('distance').innerHTML=`${signed(m.distance)}<small>m</small>`;get('speed').innerHTML=`${m.speed.toFixed(1)}<small>m/s</small>`;get('events').textContent=`${m.recoveries} / ${m.passed}`;
 const source=liveSource==='candidate'?'최근 모델':'통합 모델';get('view-label').textContent=`${STAGES[stage].label} · ${source} v${liveVersion} · ${liveAttempt.toLocaleString()}회 시점 · 실시간`;
}

function animate(time){
 lastDraw=time;
 const dt=lastTime?Math.min(.05,(time-lastTime)/1000):0;lastTime=time;
 if(!viewPaused){if(mode==='live'&&live&&!liveRobots.every(w=>w.done)){accumulator+=dt;while(accumulator>=DT){previousFrames=currentFrames;for(const w of liveRobots)if(!w.done)w.step(liveWeights);currentFrames=liveRobots.map(w=>w.snapshot());accumulator-=DT;}if(liveRobots.every(w=>w.done)){viewPaused=true;controls();if(!training)status('관찰 종료 · 중간 관찰 또는 통합 모델 실행으로 다시 시작하세요.');}}else if(mode==='trace')traceTime+=dt;if(pushArrow){pushArrow.remaining-=dt;if(pushArrow.remaining<=0)pushArrow=null;}}
 const data=sourceFrame();draw(data);if(time-lastHud>140){hud(data);lastHud=time;}
 frame=requestAnimationFrame(animate);
}
frame=requestAnimationFrame(animate);

get('export').onclick=()=>{const blob=new Blob([JSON.stringify({format:'mydesk-robot-v2',model},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mydesk-robot-model.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
get('import').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>2*1024*1024)throw Error('모델 파일은 2MB 이하여야 합니다.');const data=JSON.parse(await file.text());if(data.format!=='mydesk-robot-v2'||!RobotLearner.valid(data.model))throw Error('올바른 v2 통합 모델 파일이 아닙니다.');backup();model=data.model;configure(model);status('모델을 불러와 무보조 성능을 다시 확인합니다.');}catch(e){status(e.message);}finally{event.target.value='';}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){worker.postMessage({type:'stop'});viewPaused=true;controls();}});
document.addEventListener('game:help-open',()=>{viewPaused=true;controls();});
window.addEventListener('pagehide',()=>{worker.postMessage({type:'stop'});viewPaused=true;persist();});
let legacy=null,legacyCounts=null;
if(!model)try{const old=JSON.parse(localStorage.getItem('mydesk.robot.v1')||'{}'),valid=Object.entries(old).filter(([k,m])=>/^(balance|recover|walk|run|obstacles)-(0|30|60)$/.test(k)&&Array.isArray(m?.weights)&&m.weights.length===32&&m.weights.every(v=>Number.isFinite(v)&&Math.abs(v)<20));legacy=valid.sort((a,b)=>(b[1].bestReward||0)-(a[1].bestReward||0)).slice(0,3).map(([,v])=>v);legacyCounts=Object.fromEntries(Object.keys(STAGES).map(k=>[k,valid.filter(([name])=>name.startsWith(k+'-')).reduce((s,[,m])=>s+(Number.isSafeInteger(m.attempts)&&m.attempts>0&&m.attempts<1e10?m.attempts:0),0)]));}catch{}
function selectSkin(value){skin=value;get('character').value=skin;try{localStorage.setItem('mydesk.robot.skin',skin);}catch{}}
get('character').onchange=()=>selectSkin(get('character').value);
selectSkin(skin);progress(0,0,'대기');
get('terrain').value=options.terrain;get('view').value=options.view;get('observation-seconds').value=String(options.observationSeconds);get('interval').value=String(options.interval);
function saveOptions(){try{localStorage.setItem('mydesk.robot.options',JSON.stringify({terrain:options.terrain,view:options.view,observationSeconds:options.observationSeconds,interval:options.interval}));}catch{}}
get('terrain').onchange=()=>{options.terrain=get('terrain').value;saveOptions();setZoom(1);panX=.4;panY=0;follow=options.view==='robot';configure(model);};
get('view').onchange=()=>{const next=get('view').value;if(next==='terrain'&&follow){panX=cameraX;panY=(groundPixel-canvas.getBoundingClientRect().height*.88)/drawScale-terrainDatum;}else if(next==='robot')panY=0;options.view=next;follow=next==='robot';saveOptions();};
if(model&&model.environment?.courseVersion!==7)backup();
settings();configure(model,legacy,legacyCounts);
// Retire the former website login locally; no server requests are made.
try{localStorage.removeItem('mydesk.robot.auth');}catch{}
