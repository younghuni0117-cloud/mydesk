import {SwingLearner,DT,STEPS} from './swing-engine.mjs?v=swing3';
import {SwingScene} from './swing-scene.mjs?v=swing3';
import {SwingChart} from './swing-chart.mjs?v=swing3';
const $=id=>document.getElementById(id),engine=new SwingLearner(),canvas=$('swingCanvas');
let scene;try{scene=new SwingScene(canvas);}catch(error){$('swStatus').textContent='3D 화면을 시작하지 못했습니다. 브라우저의 하드웨어 가속을 켠 뒤 새로고침해 주세요.';console.error(error);$('swStart').disabled=$('swEvaluate').disabled=true;}
const graph=new SwingChart($('swChart'),$('swChartTooltip')),speeds=[1,4,16,64];
let running=false,evaluating=false,last=0,acc=0,previous=engine.snapshot(),next=engine.snapshot(),lastText=0,wasExploring=null;
function syncPose(){previous=next=engine.snapshot();}
function chart(){const h=engine.history;$('swEpisodes').textContent=engine.episodes.toLocaleString('ko-KR');$('swReward').textContent=h.length?(h.slice(-20).reduce((s,x)=>s+x.reward,0)/Math.min(20,h.length)).toFixed(3):'—';graph.update(h,engine.episodes);$('swChartRange').textContent=h.length?`${(engine.episodes-h.length+1).toLocaleString()}~${engine.episodes.toLocaleString()}회`:'아직 완료된 학습이 없습니다';}
function buttons(){$('swStart').textContent=running&&!evaluating?'Ⅱ 일시정지':'▶ 학습 시작';$('swEvaluate').textContent=evaluating?'■ 관찰 종료':'배운 동작 보기';$('swObjective').disabled=evaluating;$('swExplore').disabled=evaluating;$('swSpeed').disabled=evaluating;$('swMode').textContent=evaluating?'배운 동작 관찰':running?'학습 진행 중':'서서 타기';}
function frame(now){const dt=last?Math.min((now-last)/1000,.1):0;last=now;
 if(running&&scene&&!document.hidden){acc+=dt*(evaluating?1:speeds[+$('swSpeed').value]);let changed=false,steps=0;while(acc>=DT&&steps++<180){previous=next;const result=engine.step(evaluating?0:+$('swExplore').value/100,+$('swObjective').value/100,!evaluating);next=engine.snapshot();acc-=DT;if(result){syncPose();changed=true;}}if(changed)chart();if(now-lastText>400){if(wasExploring!==engine.exploring||evaluating){$('swStatus').textContent=evaluating?'탐험과 정책 갱신을 멈추고 배운 동작을 1배속으로 관찰합니다.':engine.exploring?'새로운 몸통·양쪽 무릎 조합을 시도하고 있습니다.':'현재 가치가 높은 관절 조합을 선택해 보상으로 갱신합니다.';wasExploring=engine.exploring;}lastText=now;}}
 if(scene){const alpha=running?Math.min(1,acc/DT):1,state=Object.fromEntries(Object.keys(next).map(k=>[k,previous[k]+(next[k]-previous[k])*alpha]));scene.render(state);if(now-lastText>100||running){$('swAngle').textContent=(state.theta*180/Math.PI).toFixed(1)+'°';$('swHeight').textContent=engine.peak.toFixed(2)+' m';}}
 requestAnimationFrame(frame);
}
$('swStart').onclick=()=>{if(!scene)return;if(evaluating){evaluating=false;running=true;engine.resetEpisode();syncPose();}else running=!running;acc=0;wasExploring=null;buttons();$('swStatus').textContent=running?'학습 중 · 몸통과 양쪽 무릎의 타이밍을 탐험합니다.':'학습 일시정지 · 지금까지 배운 정책은 유지됩니다.';};
$('swEvaluate').onclick=()=>{if(!engine.episodes){$('swStatus').textContent='한 회차 이상 학습한 뒤 배운 동작을 볼 수 있습니다. 학습 속도를 올리면 더 빠르게 반복합니다.';return;}evaluating=!evaluating;running=evaluating;acc=0;engine.resetEpisode();syncPose();wasExploring=null;buttons();$('swStatus').textContent=evaluating?'배운 동작을 1배속으로 관찰합니다.':'관찰 종료 · 학습 시작을 누르면 이어서 배웁니다.';};
$('swReset').onclick=()=>{running=false;evaluating=false;acc=0;engine.reset();syncPose();chart();buttons();$('swStatus').textContent='이 그네 실험의 정책과 기록을 초기화했습니다.';};
$('swViewReset').onclick=()=>scene?.resetView();
$('swSpeed').oninput=()=>$('swSpeedValue').textContent=speeds[+$('swSpeed').value]+'×';$('swExplore').oninput=()=>$('swExploreValue').textContent=$('swExplore').value+'%';
$('swObjective').oninput=()=>{const v=+$('swObjective').value;$('swObjectiveValue').textContent=`높이 ${v}% · 안정성 ${100-v}%`;running=false;evaluating=false;acc=0;engine.reset();syncPose();chart();buttons();$('swStatus').textContent='보상 목표가 바뀌어 이 실험의 정책과 그래프를 초기화했습니다.';};
document.addEventListener('visibilitychange',()=>{last=0;acc=0;syncPose();});window.addEventListener('pagehide',e=>{if(!e.persisted)scene?.dispose();});chart();buttons();requestAnimationFrame(frame);
