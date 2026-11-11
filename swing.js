import {SwingLearner,DT} from './swing-engine.mjs';
const $=id=>document.getElementById(id),engine=new SwingLearner(),canvas=$('swingCanvas'),ctx=canvas.getContext('2d');
let running=false,evaluating=false,last=0,acc=0,yaw=.48,drag=null,width=600,height=440;
const speeds=[1,4,16,64];
function resize(){const r=canvas.getBoundingClientRect();width=r.width;height=r.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}
new ResizeObserver(resize).observe(canvas);
canvas.addEventListener('pointerdown',e=>{drag=e.clientX;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(drag!==null){yaw+=(e.clientX-drag)*.008;drag=e.clientX;}});for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>drag=null);
function project(p){let [x,y,z]=p;const rx=x*Math.cos(yaw)+z*Math.sin(yaw),rz=-x*Math.sin(yaw)+z*Math.cos(yaw);y-=1.65;const ry=y*.94-rz*.34,depth=y*.34+rz*.94,scale=Math.min(width/6,height/4.5)*7/(7+depth);return [width/2+rx*scale,height*.5-ry*scale,scale];}
function line(a,b,color='#8c9d89',w=3){a=project(a);b=project(b);ctx.strokeStyle=color;ctx.lineWidth=w;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}
function dot(p,r,color){p=project(p);ctx.fillStyle=color;ctx.beginPath();ctx.arc(p[0],p[1],r*p[2],0,Math.PI*2);ctx.fill();}
function render(){ctx.clearRect(0,0,width,height);ctx.fillStyle='#eef2e8';ctx.fillRect(0,0,width,height);
 for(let i=-3;i<=3;i++){line([i,0,-2],[i,0,2],'#dbe3d3',1);line([-3,0,i*.65],[3,0,i*.65],'#dbe3d3',1);}
 for(const z of [-.58,.58]){line([-1.1,0,z],[0,3.7,z],'#8eaa8e',6);line([1.1,0,z],[0,3.7,z],'#8eaa8e',6);}line([0,3.7,-.85],[0,3.7,.85],'#315c4d',8);
 const t=engine.theta,seat=[2.2*Math.sin(t),3.55-2.2*Math.cos(t),0];
 const local=(x,y,z=0)=>[seat[0]+x*Math.cos(t)-y*Math.sin(t),seat[1]+x*Math.sin(t)+y*Math.cos(t),z];
 for(const z of [-.32,.32]){line([0,3.55,z],local(0,0,z),'#6f8170',2);line(local(-.25,0,z),local(.3,0,z),'#be8749',7);}line(local(.3,0,-.32),local(.3,0,.32),'#dba35e',7);
 const hip=local(0,.08),torso=local(.52*Math.sin(engine.hip),.08+.52*Math.cos(engine.hip)),head=local(.67*Math.sin(engine.hip),.08+.67*Math.cos(engine.hip));
 line(hip,torso,'#285e4d',19);dot(head,.14,'#386f5b');
 for(const z of [-.16,.16]){const h=local(0,.08,z),k=local(.38,-.04,z),foot=local(.38+.35*Math.sin(engine.knee*1.35),-.04-.35*Math.cos(engine.knee*1.35),z);line(h,k,'#508575',9);line(k,foot,'#315e4e',8);dot(k,.065,'#ec8f50');line(foot,[foot[0]+.13,foot[1],z],'#193e35',7);const shoulder=[torso[0],torso[1]-.04,z],hand=local(.02,.4,z*2);line(shoulder,hand,'#588977',6);dot(hand,.045,'#ec8f50');}dot(hip,.07,'#ec8f50');
 $('swAngle').textContent=(t*180/Math.PI).toFixed(1)+'°';$('swHeight').textContent=engine.peak.toFixed(2)+' m';}
function chart(){const h=engine.history; $('swEpisodes').innerHTML=engine.episodes+'<small>회</small>';$('swReward').textContent=h.length?(h.slice(-20).reduce((s,x)=>s+x.reward,0)/Math.min(20,h.length)).toFixed(3):'—';const lo=Math.min(0,...h.map(x=>x.reward)),hi=Math.max(.1,...h.map(x=>x.reward));$('swChartLine').setAttribute('d',h.map((v,i)=>(i?'L':'M')+(i/Math.max(1,h.length-1)*900).toFixed(1)+' '+(90-80*(v.reward-lo)/(hi-lo)).toFixed(1)).join(' '));$('swChartRange').textContent=h.length?`${engine.episodes-h.length+1}회 → ${engine.episodes}회`:'학습 기록을 기다리는 중';$('swChartScale').textContent=h.length?`${lo.toFixed(2)} ~ ${hi.toFixed(2)} · 세로축 자동 조정`:'';}
function buttons(){ $('swStart').textContent=running&&!evaluating?'Ⅱ 일시정지':'▶ 학습 시작';$('swEvaluate').textContent=evaluating?'■ 관찰 종료':'배운 동작 보기';$('swObjective').disabled=evaluating;}
function frame(now){const dt=last?Math.min((now-last)/1000,.1):0;last=now;if(running){acc+=dt*(evaluating?1:speeds[+$('swSpeed').value]);let changed=false;while(acc>=DT){const result=engine.step(evaluating?0:+$('swExplore').value/100,+$('swObjective').value/100,!evaluating);acc-=DT;if(result)changed=true;}if(changed)chart();$('swStatus').textContent=evaluating?'배운 행동 관찰 중 · 탐험과 정책 업데이트를 멈추고 1배속으로 재생합니다.':engine.exploring?'탐험 중 · 새로운 몸통·무릎 동작을 시도하고 가치를 갱신합니다.':'활용 중 · 현재 가치가 높은 관절 동작을 선택하고 보상으로 갱신합니다.';}render();requestAnimationFrame(frame);}
$('swStart').onclick=()=>{if(evaluating){evaluating=false;running=true;engine.resetEpisode();}else running=!running;acc=0;buttons();if(!running)$('swStatus').textContent='학습 일시정지 · 지금까지 배운 정책은 유지됩니다.';};
$('swEvaluate').onclick=()=>{if(!engine.episodes){$('swStatus').textContent='먼저 한 회차 이상 학습해 주세요. 빠른 반복은 학습 속도를 올리면 됩니다.';return;}evaluating=!evaluating;running=evaluating;acc=0;engine.resetEpisode();buttons();if(!evaluating)$('swStatus').textContent='관찰 종료 · 학습 시작을 누르면 이어서 배웁니다.';};
$('swReset').onclick=()=>{running=false;evaluating=false;acc=0;engine.reset();chart();buttons();$('swStatus').textContent='정책과 기록을 초기화했습니다. 같은 조건에서 다시 실험해 보세요.';};
$('swSpeed').oninput=()=>$('swSpeedValue').textContent=speeds[+$('swSpeed').value]+'×';$('swExplore').oninput=()=>$('swExploreValue').textContent=$('swExplore').value+'%';
$('swObjective').oninput=()=>{const v=+$('swObjective').value;$('swObjectiveValue').textContent=`높이 ${v}% · 안정성 ${100-v}%`;running=false;evaluating=false;acc=0;engine.reset();chart();buttons();$('swStatus').textContent='보상 목표가 바뀌어 정책과 그래프를 초기화했습니다. 학습 시작을 눌러 비교하세요.';};
document.addEventListener('visibilitychange',()=>{last=0;acc=0;});chart();requestAnimationFrame(frame);
