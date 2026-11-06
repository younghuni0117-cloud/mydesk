import {RobotWorld,STAGES,JOINTS,POLICY_SIZE,DT,robotGeometry,clamp} from './robot-core.mjs';
import {RobotLearner} from './robot-learning.mjs';
const get=id=>document.getElementById(`rb-${id}`),canvas=get('canvas'),ctx=canvas.getContext('2d');
const storageKey='mydesk.robot.v1';let bank={};
try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&typeof saved==='object')for(const [key,model]of Object.entries(saved))if(RobotLearner.valid(model))bank[key]=model;}catch{}
let stage='balance',assist=.6,model=null,training=false,initializing=true,requestDone=0,requestTarget=0;
let mode='trace',scene=null,pendingScene=null,traceTime=0,viewPaused=false,live=null,liveWeights=Array(POLICY_SIZE).fill(0),geometry=null;
let lastTime=0,accumulator=0,frame=null,lastHud=0,lastDraw=0,pushArrow=null,drag=null;
const key=()=>`${stage}-${Math.round(assist*100)}`;
const status=text=>{get('status').textContent=text};
const signed=n=>(n>0?'+':'')+n.toFixed(1);
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(bank));}catch{get('storage-note').textContent='이 브라우저에 모델을 저장할 수 없습니다. 도움말의 전체 모델 저장으로 파일을 내려받으세요.'}}
function controls(){get('train').disabled=initializing;get('train').textContent=training?'Ⅱ 학습 중지':'학습 시작';get('count').disabled=training||initializing;get('curriculum').disabled=training;get('pause-view').textContent=viewPaused?'▶':'Ⅱ';get('pause-view').setAttribute('aria-label',viewPaused?'관찰 화면 재생':'관찰 화면 일시정지');}
function updateModel(data){
 bank[data.key]=data.model;persist();if(data.key!==key())return;
 model=data.model;get('attempts-total').textContent=`${model.attempts.toLocaleString()}회`;get('reward').textContent=signed(model.bestReward);get('success').textContent=`${Math.round(model.success*100)}%`;
 const rows=model.history.slice(-100);const values=rows.flatMap(r=>[r.best,r.candidate]);let low=Math.min(0,...values),high=Math.max(1,...values);const span=Math.max(10,high-low);low-=span*.1;high+=span*.1;
 const start=rows[0]?.attempts??0,end=rows.at(-1)?.attempts??0;
 for(const [id,name]of [['chart-best','best'],['chart-current','candidate']])get(id).setAttribute('d',rows.map((r,i)=>`${i?'L':'M'}${start===end?0:(r.attempts-start)/(end-start)*300} ${95-(r[name]-low)/(high-low)*90}`).join(' '));
 get('chart-min').textContent=low.toFixed(0);get('chart-max').textContent=high.toFixed(0);get('chart-range').textContent=`${start}~${end}회`;
 get('chart-svg').setAttribute('aria-label',`${STAGES[stage].label}, 보조 ${assist*100}%. 최고 평균 보상 ${model.bestReward.toFixed(1)}점, ${model.attempts}회 학습. 파란색 최고 모델, 점선 후보 모델.`);
}
function configure(nextStage=stage,nextAssist=assist){
 stage=STAGES[nextStage]?nextStage:'balance';assist=[0,.3,.6].includes(Number(nextAssist))?Number(nextAssist):.6;
 get('stage').value=stage;get('assist').value=String(assist);initializing=true;training=false;model=bank[key()]||null;
 mode='trace';scene=null;pendingScene=null;live=null;traceTime=0;viewPaused=false;pushArrow=null;drag=null;
 if(model)updateModel({key:key(),model});else{get('attempts-total').textContent='0회';get('reward').textContent='—';get('success').textContent='—';get('chart-best').setAttribute('d','');get('chart-current').setAttribute('d','');}
 const initial=new RobotWorld(stage,{assist,seed:31});geometry=robotGeometry(initial);scene={trace:[initial.snapshot()],...geometry,obstacles:initial.obstacles};
 status(`${STAGES[stage].label} · 보조 ${assist*100}% 모델을 준비하고 있습니다.`);controls();
 worker.postMessage({type:'init',stage,assist,saved:model});
}
const worker=new Worker(new URL('./robot-worker.mjs',import.meta.url),{type:'module'});
function settings(){worker.postMessage({type:'settings',interval:Number(get('interval').value),source:get('source').value,light:get('light').checked});}
worker.onmessage=({data})=>{
 if(data.type==='model'){updateModel(data);return;}
 if(data.type==='ready'){if(data.key!==key())return;initializing=false;controls();status(`${STAGES[stage].label} · 보조 ${assist*100}% · 학습 시도 횟수를 입력하세요. 기본 제어기에서 실제 정책을 탐색합니다.`);return;}
 if(data.type==='training'){training=data.active;controls();return;}
 if(data.type==='progress'){if(data.key!==key())return;requestDone=data.completed;requestTarget=data.target;get('attempts-total').textContent=`${data.attempts.toLocaleString()}회`;status(`학습 ${data.completed}/${data.target}회 · 최근 시도 보상 ${signed(data.score)}점 · ${get('interval').value}회마다 중간 모델을 확인합니다.`);return;}
 if(data.type==='preview'){
  if(data.key!==key())return;
  pendingScene=data;
  if(mode==='trace'&&!viewPaused){scene={...data.scene,observedAttempts:data.attempts,observedSource:data.source};geometry={parts:scene.parts,joints:scene.joints};traceTime=0;pendingScene=null;}
  return;
 }
 if(data.type==='advance'){
  stage=data.stage;assist=data.assist;get('stage').value=stage;get('assist').value=String(assist);mode='trace';traceTime=0;scene=null;viewPaused=false;
  status(`검증 조건 통과. ${STAGES[stage].label}, 보조 ${assist*100}%로 이동했습니다.`);return;
 }
 if(data.type==='done'){training=false;requestDone=data.completed;controls();status(`${data.cancelled?'학습 중지':'학습 완료'} · 이번 요청 ${data.completed}/${data.target}회. 과제·보조 수준별 모델이 저장됐습니다. 중간 관찰 또는 모델 실행으로 확인하세요.`);return;}
 if(data.type==='error'){training=false;initializing=false;controls();status(data.message);}
};
worker.onerror=()=>{training=false;initializing=true;controls();status('학습 스레드를 실행하지 못했습니다. 페이지를 새로고침해 주세요. 모델 실행은 별도로 사용할 수 있습니다.');};
get('light').checked=window.matchMedia('(pointer: coarse)').matches;
settings();configure();
get('stage').onchange=()=>configure(get('stage').value,assist);get('assist').onchange=()=>configure(stage,Number(get('assist').value));
get('train').onclick=()=>{
 if(training){worker.postMessage({type:'stop'});status('현재 시도를 마치고 학습을 중지합니다.');return;}
 const count=Number(get('count').value);get('count').setCustomValidity('');if(!Number.isInteger(count)||count<1||count>500){get('count').setCustomValidity('1~500회 정수로 입력해 주세요.');get('count').reportValidity();return;}
 get('count').blur();requestDone=0;requestTarget=count;mode='trace';viewPaused=false;training=true;controls();status(`학습 ${count}회를 시작합니다. 중간 관찰 간격은 ${get('interval').value}회입니다.`);
 worker.postMessage({type:'train',count,curriculum:get('curriculum').checked,bank});
};
get('count').oninput=()=>get('count').setCustomValidity('');
for(const id of ['interval','source','light'])get(id).onchange=()=>{settings();if(id==='source')worker.postMessage({type:'preview'});};
function startLive(){
 live=new RobotWorld(stage,{assist,seed:17});liveWeights=model?[...model.weights]:Array(POLICY_SIZE).fill(0);geometry=robotGeometry(live);mode='live';viewPaused=false;accumulator=0;
 status(`${model?.attempts?`${model.modelAttempt}회 시점 모델`:'초기 정책'} 실시간 시험 · 보조 ${assist*100}%. 이 시험은 추가 학습하지 않습니다.`);controls();
}
get('run').onclick=startLive;
get('preview').onclick=()=>{mode='trace';viewPaused=false;if(pendingScene){scene={...pendingScene.scene,observedAttempts:pendingScene.attempts,observedSource:pendingScene.source};geometry={parts:scene.parts,joints:scene.joints};traceTime=0;pendingScene=null;}else worker.postMessage({type:'preview'});controls();};
get('pause-view').onclick=()=>{viewPaused=!viewPaused;if(!viewPaused&&pendingScene&&mode==='trace'){scene={...pendingScene.scene,observedAttempts:pendingScene.attempts,observedSource:pendingScene.source};geometry={parts:scene.parts,joints:scene.joints};traceTime=0;pendingScene=null;}controls();};
for(const button of document.querySelectorAll('[data-rb-tab]'))button.onclick=()=>{
 for(const item of document.querySelectorAll('[data-rb-tab]')){const active=item===button;item.classList.toggle('selected',active);item.setAttribute('aria-pressed',String(active));get('panel-'+item.dataset.rbTab).hidden=!active;}
};
function strengthLabel(){get('strength-value').textContent=`${get('strength').value} ${Number(get('duration').value)?'N':'N·s'}`;}
get('strength').oninput=strengthLabel;get('duration').onchange=strengthLabel;
function push(direction=Number(get('direction').value),factor=1){
 if(mode!=='live'||!live||live.done)startLive();
 const strength=Number(get('strength').value)*factor,duration=Number(get('duration').value),location=get('location').value;
 live.push(strength,direction,location,duration);viewPaused=false;
 const body=live.parts[location]||live.parts.torso;pushArrow={x:body.getPosition().x,y:body.getPosition().y,angle:direction*Math.PI/180,strength,remaining:1.1};
 status(`${STAGES[stage].label} · ${strength.toFixed(1)}${duration?'N을 0.5초간':'N·s 충격량으로'} 밀었습니다. 보조 ${assist*100}%에서 회복 반응을 관찰하세요.`);controls();
}
get('push').onclick=()=>push();
canvas.addEventListener('pointerdown',event=>{canvas.setPointerCapture(event.pointerId);drag={id:event.pointerId,x:event.clientX,y:event.clientY,endX:event.clientX,endY:event.clientY}});
canvas.addEventListener('pointermove',event=>{if(drag&&drag.id===event.pointerId){drag.endX=event.clientX;drag.endY=event.clientY}});
canvas.addEventListener('pointerup',event=>{if(!drag||drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag=null;if(Math.hypot(dx,dy)>8)push(Math.atan2(-dy,dx)*180/Math.PI,clamp(Math.hypot(dx,dy)/90,.2,1));});
canvas.addEventListener('pointercancel',()=>{drag=null});
const jointLabels=['허리','목','좌 엉덩이','좌 무릎','좌 발목','좌 발끝','우 엉덩이','우 무릎','우 발목','우 발끝','좌 어깨','좌 팔꿈치','좌 손목','우 어깨','우 팔꿈치','우 손목'];
const jointCells=[];
JOINTS.forEach((name,i)=>{const cell=document.createElement('div'),value=document.createElement('strong');cell.append(document.createTextNode(jointLabels[i]),value);get('joints').append(cell);jointCells.push(value)});
function sourceFrame(){
 if(mode==='live'&&live)return {frame:live.snapshot(),meta:{...geometry,obstacles:live.obstacles}};
 if(!scene?.trace?.length)return null;
 const duration=scene.metrics?.time||STAGES[stage].duration,t=traceTime%duration,frames=scene.trace;
 let index=Math.min(frames.length-1,Math.max(0,Math.floor(t/(DT*4))));
 const a=frames[index],b=frames[Math.min(index+1,frames.length-1)],mix=clamp((t-a.time)/(DT*4),0,1);
 const parts=a.parts.map((p,i)=>[p[0]+(b.parts[i][0]-p[0])*mix,p[1]+(b.parts[i][1]-p[1])*mix,p[2]+Math.atan2(Math.sin(b.parts[i][2]-p[2]),Math.cos(b.parts[i][2]-p[2]))*mix]);
 return {frame:{...a,parts},meta:scene};
}
function draw(data){
 const rect=canvas.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}ctx.setTransform(ratio,0,0,ratio,0,0);const W=w/ratio,H=h/ratio;ctx.clearRect(0,0,W,H);if(!data)return;
 const {frame,meta}=data,maxY=Math.max(1,...frame.parts.map((p,i)=>p[1]+(meta.parts[i].circle?meta.parts[i].w:Math.hypot(meta.parts[i].w,meta.parts[i].h)/2))),scale=Math.min(H/2.4,W/4.1,H*.78/maxY),ground=H*.88,root=frame.parts[0],camera=root[0]+.75;
 const X=x=>W/2+(x-camera)*scale,Y=y=>ground-y*scale;
 ctx.strokeStyle='#dce5f0';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,ground);ctx.lineTo(W,ground);ctx.stroke();ctx.fillStyle='#e5ebf3';ctx.fillRect(0,ground,W,H-ground);
 ctx.fillStyle='#a4b2c4';ctx.font='9px sans-serif';ctx.textAlign='center';
 for(let x=Math.floor(camera-W/scale/2);x<camera+W/scale/2+1;x++){ctx.beginPath();ctx.moveTo(X(x),ground);ctx.lineTo(X(x),ground+5);ctx.stroke();ctx.fillText(`${x}m`,X(x),ground+17)}
 for(const o of meta.obstacles||[]){ctx.fillStyle='#c2ccda';ctx.fillRect(X(o.x-o.width/2),Y(o.height),o.width*scale,o.height*scale);ctx.fillStyle='#95a6be';ctx.fillRect(X(o.x-o.width/2),Y(o.height),o.width*scale,3)}
 if(assist>0){ctx.strokeStyle='#9cb7cf';ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(X(root[0]),8);ctx.lineTo(X(root[0]),Y(root[1]));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#98acc3';ctx.textAlign='left';ctx.fillText(`보조 ${Math.round(assist*100)}%`,X(root[0])+7,Math.max(30,Y(root[1])-.3*scale));}
 for(const [i,definition]of meta.parts.entries()){
  const p=frame.parts[i];ctx.save();ctx.translate(X(p[0]),Y(p[1]));ctx.rotate(-p[2]);ctx.globalAlpha=definition.name.startsWith('left')?.68:1;ctx.fillStyle=definition.color;ctx.strokeStyle='#f8fafc';ctx.lineWidth=1;
  if(definition.circle){ctx.beginPath();ctx.arc(0,0,definition.w*scale,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#627b99';ctx.fillRect(.02*scale,-.04*scale,.07*scale,.03*scale)}
  else{ctx.fillRect(-definition.w*scale/2,-definition.h*scale/2,definition.w*scale,definition.h*scale);ctx.strokeRect(-definition.w*scale/2,-definition.h*scale/2,definition.w*scale,definition.h*scale)}ctx.restore();
 }
 for(const joint of meta.joints||[]){const p=frame.parts[joint.a],c=Math.cos(p[2]),s=Math.sin(p[2]),x=p[0]+c*joint.anchor[0]-s*joint.anchor[1],y=p[1]+s*joint.anchor[0]+c*joint.anchor[1];ctx.fillStyle='#f4f7fb';ctx.strokeStyle='#7c92ae';ctx.beginPath();ctx.arc(X(x),Y(y),Math.max(2.1,.026*scale),0,Math.PI*2);ctx.fill();ctx.stroke();}
 if(pushArrow){const a=pushArrow,dx=Math.cos(a.angle)*(.3+a.strength/25)*scale,dy=-Math.sin(a.angle)*(.3+a.strength/25)*scale,x=X(a.x),y=Y(a.y);ctx.strokeStyle='#bf875c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.stroke();ctx.beginPath();const angle=Math.atan2(dy,dx);ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx-10*Math.cos(angle-.45),y+dy-10*Math.sin(angle-.45));ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx-10*Math.cos(angle+.45),y+dy-10*Math.sin(angle+.45));ctx.stroke();}
 if(drag){ctx.strokeStyle='#b38d68';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(drag.x-rect.left,drag.y-rect.top);ctx.lineTo(drag.endX-rect.left,drag.endY-rect.top);ctx.stroke();}
}
function hud(data){if(!data)return;const m=data.frame.metrics;get('time').innerHTML=`${m.time.toFixed(1)}<small>초</small>`;get('distance').innerHTML=`${signed(m.distance)}<small>m</small>`;get('speed').innerHTML=`${m.speed.toFixed(1)}<small>m/s</small>`;get('events').textContent=`${m.recoveries} / ${m.passed}`;
 const observed=scene?.observedAttempts||0,source=scene?.observedSource==='candidate'?'최근 후보':'최고 모델';get('view-label').textContent=mode==='live'?`실시간 시험 · ${m.recovering?'회복 시도 중':'이동·균형 제어'} · 보조 ${assist*100}%`:`${observed?source:'초기 정책'} 검증 재생 · ${observed}회 학습 · 보조 ${assist*100}%`;
 for(const [i,name]of JOINTS.entries()){const j=data.meta.joints?.find(j=>j.name===name);if(j){const angle=data.frame.parts[j.b][2]-data.frame.parts[j.a][2];jointCells[i].textContent=`${(Math.atan2(Math.sin(angle),Math.cos(angle))*180/Math.PI).toFixed(0)}°`;}}
}
function animate(time){
 if(time-lastDraw<(get('light').checked?1000/24:1000/60)){frame=requestAnimationFrame(animate);return;}lastDraw=time;
 const dt=lastTime?Math.min(.1,(time-lastTime)/1000):0;lastTime=time;
 if(!viewPaused){if(mode==='live'&&live&&!live.done){accumulator+=dt;while(accumulator>=DT&&!live.done){live.step(liveWeights);accumulator-=DT;}if(live.done){viewPaused=true;controls();status(`실시간 시험 종료 · 이동 ${live.metrics().distance.toFixed(2)}m, 회복 ${live.recoveries}회, 통과 ${live.passed.size}개. 모델 실행을 누르면 다시 시작합니다.`);}}else if(mode==='trace')traceTime+=dt;if(pushArrow){pushArrow.remaining-=dt;if(pushArrow.remaining<=0)pushArrow=null;}}
 const data=sourceFrame();draw(data);if(time-lastHud>140){hud(data);lastHud=time;}
 frame=requestAnimationFrame(animate);
}
frame=requestAnimationFrame(animate);
get('export').onclick=()=>{const blob=new Blob([JSON.stringify({format:'mydesk-robot-v1',models:bank},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mydesk-robot-models.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('저장된 모델들을 파일로 내려받았습니다. 다른 기기에서 불러올 수 있습니다.');};
get('import').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>1024*1024)throw Error('모델 파일은 1MB 이하여야 합니다.');const data=JSON.parse(await file.text());if(data.format!=='mydesk-robot-v1'||!data.models)throw Error('지원하는 로봇 모델 파일이 아닙니다.');let count=0;for(const [k,v]of Object.entries(data.models)){const match=k.match(/^(balance|recover|walk|run|obstacles)-(0|30|60)$/);if(match&&RobotLearner.valid(v)&&v.stage===match[1]&&Math.round(Number(v.options?.assist)*100)===Number(match[2])){bank[k]=v;count++;}}if(!count)throw Error('유효한 모델이 없습니다.');persist();configure();status(`${count}개 조건의 모델을 불러왔습니다.`);}catch(e){status(e.message);}finally{event.target.value='';}};
get('reset').onclick=()=>{delete bank[key()];persist();configure();status('현재 과제·보조 수준의 모델만 초기화했습니다. 다른 조건은 유지됩니다.');};
document.addEventListener('visibilitychange',()=>{if(document.hidden){worker.postMessage({type:'stop'});viewPaused=true;controls();}});
document.addEventListener('game:help-open',()=>{viewPaused=true;controls();});
window.addEventListener('pagehide',()=>{worker.postMessage({type:'stop'});viewPaused=true;});
