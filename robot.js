import {drawEyeSensorGauge} from './robot-sensor-view.mjs?v=robot38';
import {sampleEnvironment,VISION_VERSION} from './robot-sensors.mjs?v=robot38';
import {hammerEffects,drawHammer} from './robot-impact.mjs?v=robot38';
import {normalizeEvaluationSettings} from './robot-evaluation.mjs?v=robot38';
import {abilitySummary} from './robot-performance.mjs?v=robot38';
import {RobotSharedStorage} from './robot-shared-storage.mjs?v=robot38';
import {REWARD_VERSION} from './robot-rewards.mjs?v=robot38';
import {normalizeCommand,commandLabel} from './robot-goals.mjs?v=robot38';
import {rewardHelp} from './robot-rewards.mjs?v=robot38';
import {drawTerrainScene,terrainArtReady} from './robot-scenery.mjs?v=robot38';
import {RobotTeam} from './robot-team.mjs?v=robot38';
import {TERRAINS,terrainHeight} from './robot-terrain.mjs?v=robot38';
import {drawRobotSkin} from './robot-skin.mjs?v=robot38';
import {traceFrame,interpolateFrame,chartDomain,taskChartRows} from './robot-view.mjs?v=robot38';
import {RobotWorld,STAGES,POLICY_SIZE,DT,robotGeometry,clamp,normalizePushSettings} from './robot-core.mjs?v=robot38';
import {RobotLearner,ALLOWED_ATTEMPTS,migrateModel} from './robot-learning.mjs?v=robot38';
const get=id=>document.getElementById(`rb-${id}`),canvas=get('canvas'),ctx=canvas.getContext('2d');
const storage=new RobotSharedStorage(migrateModel),loaded=await storage.load();let model=loaded.model,recoveryBlocked=loaded.blocked;
let skin='explorer';try{const saved=localStorage.getItem('mydesk.robot.skin');if(['explorer','tin','space','hiker','doyun','seona'].includes(saved))skin=saved;}catch{}
let options={terrain:'meadow',view:'terrain',robots:1,observationSeconds:30,interval:20,...normalizePushSettings()};try{const o=JSON.parse(localStorage.getItem('mydesk.robot.options')||'{}');options={terrain:o.terrain==='rockyhills'?'desert':TERRAINS[o.terrain]?o.terrain:'meadow',view:o.view==='robot'?'robot':'terrain',robots:1,observationSeconds:Number.isInteger(o.observationSeconds)&&o.observationSeconds>=1&&o.observationSeconds<=3600?o.observationSeconds:30,interval:[10,20,50,100].includes(o.interval)?o.interval:20,...normalizePushSettings(o)};}catch{}
Object.assign(options,normalizeEvaluationSettings(model?.environment));try{const raw=JSON.parse(localStorage.getItem('mydesk.robot.options')||'{}');Object.assign(options,normalizeEvaluationSettings({...options,...raw}));}catch{}
let command=normalizeCommand();try{command=normalizeCommand(JSON.parse(localStorage.getItem('mydesk.robot.options')||'{}').command);}catch{}
try{const o=JSON.parse(localStorage.getItem('mydesk.robot.options')||'{}');options.algorithm=['cem','ppo'].includes(o.algorithm)?o.algorithm:model?.algorithm||'ppo';options.curriculum=o.curriculum!==false;options.graphRange=['all','500','1000','2000','5000','10000','custom'].includes(o.graphRange)?o.graphRange:'all';options.graphCustom=Number.isSafeInteger(o.graphCustom)&&o.graphCustom>=1?o.graphCustom:5000;options.graphVersion=o.graphVersion==='previous'?'previous':'current';options.focus=STAGES[o.focus]?o.focus:model?.focus||'balance';}catch{Object.assign(options,{algorithm:model?.algorithm||'ppo',curriculum:true,graphRange:'all',graphCustom:5000,graphVersion:'current',focus:model?.focus||'balance'});}
options.sensorVisible=false;try{options.sensorVisible=JSON.parse(localStorage.getItem('mydesk.robot.options')||'{}').sensorVisible===true;}catch{}
let pickingTarget=false;
let liveRobots=[],previousFrames=[],currentFrames=[];
let stage=options.focus,training=false,initializing=true;
let mode='trace',scene=null,pendingScene=null,traceTime=0,viewPaused=false,live=null,liveWeights=Array(POLICY_SIZE).fill(0),geometry=null;
let viewSource='best',liveSource='best',liveAttempt=0,liveVersion=0,latestPreview=null,liveTrial=null,resetPending=false;
let previousLive=null,currentLive=null,lastPersist=0,lastProgressHud=0;
let lastTime=0,accumulator=0,frame=null,lastHud=0,lastDraw=0,pushArrow=null,drag=null;
let zoom=1,panX=.4,panY=0,follow=options.view==='robot',drawScale=100,cameraX=0;const pointers=new Map();let pinch=null;
const status=text=>{get('status').textContent=text},signed=n=>(n>0?'+':'')+n.toFixed(1);
function sharedStatus(){const text={connecting:'공용 모델 연결 중',empty:'공용 모델 공유 · 첫 학습 대기',saving:'공용 모델 저장 중',synced:'공용 모델 자동 공유',offline:'연결 대기 · 학습 결과는 이 기기에 임시 저장',invalid:'공용 모델 형식 오류 · 초기화가 필요합니다.'}[storage.state];get('shared-state').textContent=text;get('storage-note').textContent=text;if(storage.state==='synced'&&!training&&get('status').textContent.includes('공용 저장 연결 대기'))get('status').textContent=get('status').textContent.replace('공용 저장 연결 대기','공용 모델 저장 완료');}
storage.onstate=sharedStatus;
function persist(){if(!model||recoveryBlocked)return;return storage.save(model);}
let resolveReady=null,syncBusy=false,trainingStartAttempt=0;
async function useShared(next){model=next;recoveryBlocked=false;renderModel();return configure(model);}
async function refreshShared(){if(syncBusy||training||initializing||document.hidden)return;syncBusy=true;controls();try{if(storage.pendingModel||storage.needsSeed){const result=await storage.retry();if(result.model&&result.model.id!==model?.id)await useShared(result.model);}if(!storage.pendingModel){const result=await storage.refresh();if(result.changed)await useShared(result.model);}}catch{storage.setState('offline');}finally{syncBusy=false;controls();}}

let lastRequest={completed:0,target:0},lastProgressText=0,lastRemainingText=0;
function progress(completed,target,label,total=model?.attempts||0,force=false){lastRequest={completed,target};const ratio=target?Math.min(100,completed/target*100):0;get('progress').value=ratio;get('progress').textContent=Math.round(ratio)+'%';const now=Date.now();if(force||!completed||completed===target||now-lastProgressText>=1000){get('progress-label').textContent=target?`${completed.toLocaleString()} / ${target.toLocaleString()}회 · ${Math.floor(ratio)}%`:`누적 ${total.toLocaleString()}회`;lastProgressText=now;}}

function controls(){get('train').disabled=initializing||recoveryBlocked||syncBusy;get('algorithm').disabled=initializing||training||recoveryBlocked;get('curriculum').disabled=initializing||training;get('reset').disabled=initializing;get('run').disabled=initializing||recoveryBlocked;for(const id of ['command-mode','command-direction','command-speed','command-position','command-posture','pick-target'])get(id).disabled=initializing||recoveryBlocked;for(const id of ['terrain','validation-seconds','monitor-seconds'])get(id).disabled=initializing||training||recoveryBlocked;get('preview').disabled=initializing||recoveryBlocked;get('train').textContent=training?'Ⅱ 학습 중지':'학습 시작';get('count').disabled=training||initializing||recoveryBlocked;get('focus').disabled=training||initializing||recoveryBlocked;get('auto-push').disabled=training||initializing;for(const id of ['push-min','push-max','push-frequency'])get(id).disabled=training||initializing||!options.autoPush;get('pause-view').textContent=viewPaused?'▶':'Ⅱ';get('run').setAttribute('aria-pressed',String(viewSource==='best'));get('preview').setAttribute('aria-pressed',String(viewSource==='candidate'));}
for(const id of ['focus'])for(const [value,s]of Object.entries(STAGES)){const o=document.createElement('option');o.value=value;o.textContent=s.label;get(id).append(o);}
for(const value of ALLOWED_ATTEMPTS){const o=document.createElement('option');o.value=String(value);o.textContent=value.toLocaleString()+'회';get('count').append(o);}get('count').value='10000';
const cells={};for(const [key,s]of Object.entries(STAGES)){const row=document.createElement('tr'),title=document.createElement('th');title.scope='row';title.textContent=s.label.replace('넘어졌다 ','').replace('빠르게 달리기','달리기');row.append(title);cells[key]=[];for(let i=0;i<3;i++){const cell=document.createElement('td');cell.textContent='—';row.append(cell);cells[key].push(cell);}get('abilities').append(row);}
function renderModel(){if(!model)return;for(const [key,a]of Object.entries(model.abilities)){cells[key][0].textContent=model.taskAttempts[key].toLocaleString();cells[key][1].textContent=signed(a.meanReward);cells[key][2].textContent=Math.round(a.passRate*100)+'%';cells[key][2].title=a.cases.map(c=>c.label+': '+(c.passed?'통과':'미통과')).join('\n');}
 if(get('balance-plan')){const longest=model.abilities.balance.cases[0]?.metrics?.longestUpright||0;get('balance-plan').textContent=stage==='balance'?`균형 학습 · ${options.curriculum?(longest<1.5?'2초 기초 · 외력 대기':longest<3.5?'4초 유지 · 외력 대기':options.validationSeconds+'초 외력 적응'):options.validationSeconds+'초 전체 조건'} · 검증 ${options.validationSeconds}초`:'';}
 if(get('monitor-summary')){const monitor=model.generalization;get('monitor-summary').textContent=monitor?.task===stage?`추가 시험 ${monitor.seconds??monitor.ability.cases[0]?.metrics?.plannedDuration??STAGES[stage].duration}초 · 서 있음 ${(abilitySummary(monitor.ability,monitor.seconds)?.standing??0).toFixed(1)}초 · 통과 ${Math.round(monitor.ability.passRate*100)}%`:`통합 모델이 개선되면 ${options.monitorSeconds}초 추가 시험을 진행합니다.`;}
 renderChart();
}
function previousChart(){const current=JSON.stringify(model.environment),last=model?.history.filter(r=>(r.rewardVersion??1)!==REWARD_VERSION||r.environment!==current).at(-1);if(!last?.taskAttempts||!last.rewards)return null;const version=last.rewardVersion??1,rows=model.history.filter(r=>(r.rewardVersion??1)===version&&r.environment===last.environment);return {...model,rewardVersion:version,history:rows,taskAttempts:last.taskAttempts,abilities:Object.fromEntries(Object.keys(STAGES).map(k=>[k,{meanReward:last.rewards[k]}]))};}

function renderChart(){if(!model)return;const old=options.graphVersion==='previous'?previousChart():null,source=old||model,version=old?(old.rewardVersion??Math.max(...old.history.map(r=>r.rewardVersion??1))):REWARD_VERSION,end=source.taskAttempts[stage],window=options.graphRange==='all'?end:options.graphRange==='custom'?options.graphCustom:Number(options.graphRange),start=Math.max(0,end-window),rows=taskChartRows(source,stage,version,old?null:JSON.stringify(source.environment)).filter(r=>r.attempts>=start);
 const current=source.abilities[stage].meanReward,values=[...rows,{overall:current,candidate:current}],[min,max]=chartDomain(values),Y=v=>95-(v-min)/(max-min)*90,X=n=>end>start?(n-start)/(end-start)*300:0;
 for(const [id,k]of [['chart-best','overall'],['chart-current','candidate']]){let connected=false;get(id).setAttribute('d',rows.map(r=>{if(!Number.isFinite(r[k])){connected=false;return '';}const point=`${connected?'L':'M'}${X(r.attempts)} ${Y(r[k])}`;connected=true;return point;}).join(' '));}
 get('chart-dot').setAttribute('cx',X(end));get('chart-dot').setAttribute('cy',Y(current));get('chart-title').textContent=STAGES[stage].label+' · 평균 보상'+(old?' · 이전 기준':'');get('y-max').textContent=max.toFixed(1);get('y-mid').textContent=((max+min)/2).toFixed(1);get('y-min').textContent=min.toFixed(1);get('chart-min').textContent=min.toFixed(1);get('chart-max').textContent=max.toFixed(1);get('chart-range').textContent=`${start.toLocaleString()}~${end.toLocaleString()}회`;get('x-min').textContent=start.toLocaleString();get('x-mid').textContent=Math.round((start+end)/2).toLocaleString();get('x-max').textContent=end.toLocaleString()+'회';get('chart-svg').setAttribute('aria-label',`${STAGES[stage].label} ${old?'이전':'현재'} 보상 ${current.toFixed(1)}점. 학습 ${start}~${end}회. 보상 기준이 다른 기록은 구분합니다.`);
}
get('graph-range').onchange=()=>{options.graphRange=get('graph-range').value;get('graph-custom-row').hidden=options.graphRange!=='custom';saveOptions();renderChart();};
get('graph-custom').onchange=()=>{const input=get('graph-custom'),value=Number(input.value);if(!Number.isSafeInteger(value)||value<1||value>1e9){input.setCustomValidity('1~1,000,000,000 사이의 정수를 입력하세요.');input.reportValidity();return;}input.setCustomValidity('');options.graphCustom=value;saveOptions();renderChart();};
get('graph-version').onchange=()=>{options.graphVersion=get('graph-version').value;saveOptions();renderChart();};
get('algorithm').onchange=()=>{options.algorithm=get('algorithm').value;saveOptions();status('다음 학습 방식 · '+(options.algorithm==='ppo'?'PPO':'개선 CEM'));};
get('curriculum').onchange=()=>{options.curriculum=get('curriculum').checked;saveOptions();renderModel();};

get('reward-commands').textContent=rewardHelp(STAGES).commands;
const rewardDetails={};const rewardInfo=rewardHelp(STAGES);for(const key of ['standing','speed','penalties','push','attention']){const p=document.createElement('p');p.textContent=rewardInfo[key];get('reward-common').append(p);}for(const task of rewardInfo.tasks){const details=document.createElement('details'),summary=document.createElement('summary');details.open=task.id===stage;summary.textContent=`${task.label} · 1회 ${task.duration}초 · 목표 ${task.target}m/s`;details.append(summary);for(const [label,key]of [['상점','positive'],['벌점','negative'],['검증 통과 기준','validation']]){const p=document.createElement('p');p.textContent=label+': '+task[key];details.append(p);}get('reward-tasks').append(details);rewardDetails[task.id]=details;}
const worker=new RobotTeam();
function configure(saved=model){initializing=true;training=false;viewSource='best';latestPreview=null;mode='trace';live=null;scene=null;pendingScene=null;traceTime=0;viewPaused=false;const initial=new RobotWorld(stage,{...options,seed:31,disturbances:false});geometry=robotGeometry(initial);scene={trace:[initial.snapshot()],...geometry,obstacles:initial.obstacles,terrain:initial.terrain};resolveReady?.(false);const ready=new Promise(resolve=>{resolveReady=resolve;});controls();worker.postMessage({type:'init',stage,focus:stage,saved,environment:{terrain:options.terrain,courseVersion:10,visionVersion:VISION_VERSION,...normalizeEvaluationSettings(options)},robotCount:options.robots});return ready;}
function settings(){worker.postMessage({type:'settings',interval:options.interval});}
worker.onmessage=async({data})=>{
 if(data.type==='model'){if(!RobotLearner.valid(data.model)){status('모델 데이터 검증 실패');return;}model=data.model;renderModel();persist();if(training&&model.attempts>trainingStartAttempt)void storage.publish(model);progress(lastRequest.completed,lastRequest.target,'학습');return;}
 if(data.type==='ready'){const wasReset=resetPending;if(storage.needsSeed&&model?.attempts>0){const result=await storage.seed(model);if(result.model&&(result.model.id!==model.id||result.model.attempts!==model.attempts)){void useShared(result.model);return;}}if(resetPending){await storage.publish(model,{force:true});resetPending=false;status('공용 로봇 학습 데이터 초기화 완료');}else status(`${TERRAINS[options.terrain]} · 준비 완료`);initializing=false;if(!live)startLive();controls();status(wasReset?'공용 로봇 학습 데이터 초기화 완료':`${TERRAINS[options.terrain]} · 준비 완료`);sharedStatus();resolveReady?.(true);resolveReady=null;return;}
 if(data.type==='training'){training=data.active;controls();return;}
 if(data.type==='goal'){if(!training){if(!live)startLive();controls();status(`${TERRAINS[options.terrain]} · 준비 완료`);}return;}
 if(data.type==='phase')return;
 if(data.type==='progress'){progress(data.completed,data.target,'학습 중',data.attempts);if(model){model.attempts=data.attempts;model.taskAttempts=data.taskAttempts;if(data.algorithmAttempts)model.algorithmAttempts=data.algorithmAttempts;if(Date.now()-lastProgressHud>1000){for(const k of Object.keys(STAGES))cells[k][0].textContent=model.taskAttempts[k].toLocaleString();lastProgressHud=Date.now();renderChart();}if(Date.now()-lastPersist>1000){persist();lastPersist=Date.now();}}if(Date.now()-lastRemainingText>=5000){const minutes=Math.max(1,Math.ceil(data.remainingMs/60000)),remaining=minutes<60?minutes+'분':Math.floor(minutes/60)+'시간'+(minutes%60?' '+minutes%60+'분':'');status('학습 중 · 예상 남은 시간 약 '+remaining);lastRemainingText=Date.now();}return;}
 if(data.type==='preview'){if(data.stage!==stage)return;latestPreview=data;if(viewSource==='candidate'&&(!viewPaused||live?.done))showRecent();return;}
 if(data.type==='done'){const finishedId=model?.id;await persist();const shared=await storage.publish(model,{force:true});if(model?.id!==finishedId)return;progress(data.completed,data.target,data.cancelled?'중지':'완료',model?.attempts||0,true);training=false;if(viewSource==='candidate'&&mode==='trace'&&latestPreview)showRecent();controls();if(recoveryBlocked){status('공용 모델을 읽을 수 없습니다.');return;}status(`${data.cancelled?'학습 중지':'학습 완료'} · ${data.completed.toLocaleString()}/${data.target.toLocaleString()}회 · ${shared.ok?'공용 모델 저장 완료':'공용 저장 연결 대기'}`);return;}
 if(data.type==='error'){resolveReady?.(false);resolveReady=null;training=false;initializing=false;controls();status(data.message);}
};
worker.onerror=()=>{training=false;initializing=true;controls();status('학습 스레드 오류입니다. 저장된 모델을 유지합니다. 새로고침해 주세요.');};
get('focus').onchange=()=>{stage=get('focus').value;options.focus=stage;saveOptions();for(const [key,details]of Object.entries(rewardDetails))details.open=key===stage;renderModel();viewSource='best';mode='trace';viewPaused=false;scene=null;live=null;latestPreview=null;worker.postMessage({type:'goal',stage});controls();status(`${STAGES[stage].label} · 같은 로봇으로 관찰합니다.`);pendingScene=null;traceTime=0;};
get('train').onclick=async()=>{if(training){worker.postMessage({type:'stop'});status('현재 시도를 마치고 공용 모델에 저장합니다.');return;}if(initializing||recoveryBlocked)return;const count=Number(get('count').value);if(!ALLOWED_ATTEMPTS.includes(count)||!updatePushOptions(true)||!updateEvaluationOptions(true))return;initializing=true;controls();status('최신 공용 모델을 확인하고 있습니다.');try{if(storage.pendingModel){await storage.retry();}const latest=await storage.refresh(true);if(latest.changed&&latest.model){if(!await useShared(latest.model))return;}}catch{storage.setState('offline');}initializing=false;progress(0,count,'시작');lastRemainingText=Date.now();status('학습 중');trainingStartAttempt=model?.attempts||0;training=true;viewSource='candidate';viewPaused=false;latestPreview=null;controls();worker.postMessage({type:'train',count,focus:get('focus').value,trainingPush:normalizePushSettings(options),trainingCommand:command,algorithm:options.algorithm,curriculum:options.curriculum});};
function updatePushOptions(report=false){const low=Number(get('push-min').value),high=Number(get('push-max').value),valid=Number.isFinite(low)&&Number.isFinite(high)&&low>=.1&&high<=30&&low<=high;get('push-min').setCustomValidity('');get('push-max').setCustomValidity('');if(options.autoPush&&!valid){get('push-max').setCustomValidity('세기는 0.1~30 N·s, 최대는 최소 이상으로 입력하세요.');if(report){get('details').open=true;get('push-max').reportValidity();}return false;}if(valid){options.pushMin=low;options.pushMax=high;}options.pushInterval=Number(get('push-frequency').value)||0;get('push-frequency-label').textContent=options.pushInterval?options.pushInterval+'초 간격':'시도당 1회';saveOptions();return true;}
get('auto-push').onchange=()=>{if(training||initializing)return;options.autoPush=get('auto-push').checked;updatePushOptions();controls();};
for(const id of ['push-min','push-max','push-frequency'])get(id).onchange=()=>updatePushOptions();
get('interval').onchange=()=>{options.interval=Number(get('interval').value);saveOptions();settings();};
function updateEvaluationOptions(report=false){
 const quick=get('validation-seconds'),long=get('monitor-seconds'),q=Number(quick.value),m=Number(long.value);quick.setCustomValidity('');long.setCustomValidity('');
 let invalid=null;if(!Number.isInteger(q)||q<6||q>120){quick.setCustomValidity('6~120초 사이의 정수를 입력하세요.');invalid=quick;}
 else if(!Number.isInteger(m)||m<10||m>3600||m<q){long.setCustomValidity('추가 시험은 검증 시간 이상인 10~3600초로 입력하세요.');invalid=long;}
 if(invalid){if(report){get('details').open=true;invalid.reportValidity();}return false;}
 Object.assign(options,normalizeEvaluationSettings({validationSeconds:q,monitorSeconds:m}));saveOptions();return true;
}
for(const key of ['validation','monitor'])get(key+'-seconds').onchange=()=>{if(training||initializing||!updateEvaluationOptions(true))return;configure(model);};
get('observation-seconds').onchange=()=>{const input=get('observation-seconds'),seconds=Number(input.value);if(!Number.isInteger(seconds)||seconds<1||seconds>3600){input.setCustomValidity('1~3600초 사이의 정수를 입력하세요.');input.reportValidity();return;}input.setCustomValidity('');options.observationSeconds=seconds;saveOptions();if(live)startLive(liveWeights,liveSource,liveAttempt,liveVersion,liveTrial);};
function startLive(weights=model?.weights||Array(POLICY_SIZE).fill(0),source='best',attempt=model?.attempts||0,version=model?.policyVersion||0,trial=null){liveTrial=trial;liveRobots=Array.from({length:options.robots},(_,i)=>new RobotWorld(stage,{...options,seed:trial?.seed??31+i*101,disturbances:false,pushes:trial?.pushPlan||[],terrainVariant:trial?.terrainVariant??0,spawnRange:trial?.spawnRange,spawnTilt:trial?.spawnTilt,command:source==='best'?command:null,commandSchedule:source==='candidate'?trial?.commandSchedule||[]:[]}));live=liveRobots[0];previousFrames=currentFrames=liveRobots.map(w=>w.snapshot());previousLive=currentLive=currentFrames[0];liveWeights=[...weights];liveSource=source;liveAttempt=attempt;liveVersion=version;geometry=robotGeometry(live);mode='live';viewPaused=false;accumulator=0;if(!training)status(`${source==='candidate'?'최근 모델':'통합 모델'} v${version} · ${STAGES[stage].label} · ${options.observationSeconds}초 관찰`);controls();}
function syncCommandControls(){
 get('command-mode').value=command.mode;get('command-direction').value=String(command.direction);get('command-speed').value=String(command.speed);get('command-speed-value').textContent=command.speed.toFixed(2)+'m/s';get('command-position').value=String(command.position);get('command-posture').value=command.posture;
 get('command-direction-row').hidden=command.mode!=='move';get('command-speed-row').hidden=command.mode==='hold';get('command-position-row').hidden=command.mode!=='position';get('pick-target').hidden=command.mode!=='position';get('command-summary').textContent=commandLabel(command);if(command.mode!=='position')setPicking(false);
}
function setPicking(on){pickingTarget=on;get('pick-target').textContent=on?'목표 선택 취소':'지형에서 목표 선택';get('pick-target').setAttribute('aria-pressed',String(on));canvas.style.cursor=on?'crosshair':'';}
function applyCommand(next){command=normalizeCommand(next);syncCommandControls();saveOptions();if(mode==='live'&&liveSource==='best'&&live&&!live.done){for(const w of liveRobots)w.setCommand(command);status('목표 변경 · '+commandLabel(command));}else if(!initializing)status('다음 통합 모델 실행 · '+commandLabel(command));}
for(const id of ['command-mode','command-direction','command-posture'])get(id).onchange=()=>applyCommand({...command,mode:get('command-mode').value,direction:Number(get('command-direction').value),posture:get('command-posture').value});
get('command-speed').oninput=()=>applyCommand({...command,speed:Number(get('command-speed').value)});
get('command-position').onchange=()=>{const input=get('command-position'),value=Number(input.value);if(!input.value.trim()||!Number.isFinite(value)||value< -30||value>30){input.setCustomValidity('출발점 기준 −30~30m 사이로 입력하세요.');input.reportValidity();return;}input.setCustomValidity('');applyCommand({...command,position:value});};
get('pick-target').onclick=()=>{setPicking(!pickingTarget);if(pickingTarget)status('지형에서 목표 위치를 누르세요.');};

function showRecent(){if(training&&latestPreview?.scene?.trace?.length){scene=latestPreview.scene;live=null;liveRobots=[];liveSource='candidate';liveAttempt=latestPreview.attempts;liveVersion=latestPreview.policyVersion;liveTrial=latestPreview;mode='trace';traceTime=0;viewPaused=false;controls();return;}if(latestPreview)startLive(latestPreview.weights,latestPreview.source,latestPreview.attempts,latestPreview.policyVersion,latestPreview);else worker.postMessage({type:'preview'});}
get('run').onclick=()=>{viewSource='best';startLive();};
get('preview').onclick=()=>{viewSource='candidate';viewPaused=false;showRecent();controls();};
get('pause-view').onclick=()=>{viewPaused=!viewPaused;controls();};
function pushAt(direction,factor=1,point=null){if(initializing)return;if(mode!=='live'||!live){if(viewSource==='candidate'&&latestPreview)startLive(latestPreview.weights,'candidate',latestPreview.attempts,latestPreview.policyVersion,latestPreview);else startLive();}else if(liveRobots.every(w=>w.done))startLive(liveWeights,liveSource,liveAttempt,liveVersion,liveTrial);let index=0;if(point){let best=Infinity;for(let i=0;i<liveRobots.length;i++){const p=liveRobots[i].parts.torso.getPosition(),distance=Math.hypot(p.x+i*3.8-point.x,p.y-point.y);if(distance<best){best=distance;index=i;}}}const robot=liveRobots[index],strength=clamp(factor*8,.5,30);robot.push(strength,direction,'torso');viewPaused=false;const p=robot.parts.torso.getPosition();pushArrow={x:p.x+index*3.8,y:p.y,angle:direction*Math.PI/180,strength,remaining:1.1};status(`로봇 ${index+1} · ${strength.toFixed(1)} N·s 밀기`);controls();}
function setZoom(value){zoom=clamp(value,.04,2.5);}

canvas.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom*Math.exp(-e.deltaY*.001));},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
let groundPixel=0,terrainDatum=0;
canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')e.preventDefault();canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const[a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2};drag=null;}else if(pointers.size===1){const rect=canvas.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,endX:e.clientX,endY:e.clientY,mode:e.button===2?'pan':'push',point:{x:cameraX+(e.clientX-rect.left-rect.width/2)/drawScale,y:(groundPixel-(e.clientY-rect.top))/drawScale}};}});
function pan(dx,dy){if(follow){panX=cameraX;panY=(groundPixel-canvas.getBoundingClientRect().height*.88)/drawScale-terrainDatum;follow=false;options.view='terrain';get('view').value='terrain';saveOptions();}panX-=dx/drawScale;panY+=dy/drawScale;}
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const prev=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2&&pinch){const[a,b]=[...pointers.values()],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;setZoom(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance));pan(cx-pinch.cx,cy-pinch.cy);pinch.cx=cx;pinch.cy=cy;return;}if(drag){drag.endX=e.clientX;drag.endY=e.clientY;if(drag.mode==='pan')pan(e.clientX-prev.x,e.clientY-prev.y);}});
function release(e){if(drag&&drag.id===e.pointerId&&drag.mode==='push'&&e.type==='pointerup'){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(pickingTarget){const rect=canvas.getBoundingClientRect(),x=clamp(cameraX+(e.clientX-rect.left-rect.width/2)/drawScale,-30,30);setPicking(false);applyCommand({...command,mode:'position',position:Math.round(x*10)/10});}else if(Math.hypot(dx,dy)>8)pushAt(Math.atan2(-dy,dx)*180/Math.PI,Math.hypot(dx,dy)/90,drag.point);}pointers.delete(e.pointerId);drag=null;pinch=null;}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
function sourceFrame(){
 if(mode==='live'&&live){const actors=liveRobots.map((w,i)=>({frame:interpolateFrame(previousFrames[i],currentFrames[i],w.done?1:accumulator/DT),meta:{...geometry,obstacles:w.obstacles,terrain:w.terrain,pushPlan:w.pushes},offset:i*3.8}));return {...actors[0],actors};}
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
 if(liveSource==='best'&&command.mode==='position'){const x=X(command.position),y=Y(terrainHeight(meta.terrain.segments,command.position));ctx.strokeStyle='#527aa4';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-36);ctx.lineTo(x+14,y-30);ctx.lineTo(x,y-24);ctx.stroke();ctx.fillStyle='#466989';ctx.font='10px sans-serif';ctx.fillText(command.position.toFixed(1)+'m',x+4,y-40);}
 for(const actor of actors){const Xlocal=x=>X(x+actor.offset);drawRobotSkin(ctx,actor.meta.parts,actor.frame.parts,Xlocal,Y,scale,skin);if(options.sensorVisible){const point=name=>{const pose=actor.frame.parts[actor.meta.parts.findIndex(p=>p.name===name)];return {x:pose[0],y:pose[1],angle:pose[2]};},pelvis=point('pelvis'),sensors=sampleEnvironment(actor.meta.terrain,actor.meta.obstacles||[],pelvis,{left:point('leftFoot'),right:point('rightFoot')},point('head'),(actor.frame.metrics?.targetSpeed??0)<0?-1:1);drawEyeSensorGauge(ctx,sensors,Xlocal,Y,scale);}for(const effect of hammerEffects(actor.frame,actor.meta))drawHammer(ctx,effect,Xlocal,Y,scale);}
 if(pushArrow){const a=pushArrow,dx=Math.cos(a.angle)*(.3+a.strength/25)*scale,dy=-Math.sin(a.angle)*(.3+a.strength/25)*scale,x=X(a.x),y=Y(a.y);ctx.strokeStyle='#bf875c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.stroke();ctx.beginPath();const angle=Math.atan2(dy,dx);ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx-10*Math.cos(angle-.45),y+dy-10*Math.sin(angle-.45));ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx-10*Math.cos(angle+.45),y+dy-10*Math.sin(angle+.45));ctx.stroke();}
 if(drag&&drag.mode==='push'){ctx.strokeStyle='#b38d68';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(drag.x-rect.left,drag.y-rect.top);ctx.lineTo(drag.endX-rect.left,drag.endY-rect.top);ctx.stroke();}
}
function hud(data){if(!data)return;const m=data.frame.metrics;get('time').innerHTML=`${m.time.toFixed(1)}<small>초</small>`;get('distance').innerHTML=`${signed(m.distance)}<small>m</small>`;get('speed').innerHTML=`${m.speed.toFixed(1)}<small>m/s</small>`;get('events').textContent=`${m.recoveries} / ${m.passed}`;

}

function animate(time){
 lastDraw=time;
 const dt=lastTime?Math.min(.05,(time-lastTime)/1000):0;lastTime=time;
 if(!viewPaused){if(mode==='live'&&live&&!liveRobots.every(w=>w.done)){accumulator+=dt;while(accumulator>=DT){previousFrames=currentFrames;for(const w of liveRobots)if(!w.done)w.step(liveWeights,false);currentFrames=liveRobots.map(w=>w.snapshot());accumulator-=DT;}if(liveRobots.every(w=>w.done)){viewPaused=true;controls();if(!training)status('관찰 종료 · 중간 관찰 또는 통합 모델 실행으로 다시 시작하세요.');}}else if(mode==='trace')traceTime+=dt;if(pushArrow){pushArrow.remaining-=dt;if(pushArrow.remaining<=0)pushArrow=null;}}
 const data=sourceFrame();draw(data);if(time-lastHud>140){hud(data);lastHud=time;}
 frame=requestAnimationFrame(animate);
}
frame=requestAnimationFrame(animate);

get('reset').onclick=async()=>{if(initializing||!window.confirm('모든 기기가 공유하는 로봇의 학습 데이터와 그래프를 초기화할까요?'))return;worker.terminate();model=null;recoveryBlocked=false;latestPreview=null;liveTrial=null;pushArrow=null;resetPending=true;progress(0,0,'초기화',0);configure(null);status('공용 로봇의 새 모델을 준비합니다.');};

document.addEventListener('visibilitychange',()=>{if(document.hidden){worker.postMessage({type:'stop'});viewPaused=true;controls();}else void refreshShared();});
document.addEventListener('game:help-open',()=>{viewPaused=true;controls();});
window.addEventListener('pagehide',()=>{worker.postMessage({type:'stop'});viewPaused=true;persist();});
function selectSkin(value){skin=value;get('character').value=skin;try{localStorage.setItem('mydesk.robot.skin',skin);}catch{}}
get('character').onchange=()=>selectSkin(get('character').value);
selectSkin(skin);progress(0,0,'대기');
get('push-frequency').value=String(options.pushInterval);get('push-frequency-label').textContent=options.pushInterval?options.pushInterval+'초 간격':'시도당 1회';get('sensor-visible').checked=options.sensorVisible;get('sensor-visible').onchange=()=>{options.sensorVisible=get('sensor-visible').checked;saveOptions();};get('validation-seconds').value=String(options.validationSeconds);get('monitor-seconds').value=String(options.monitorSeconds);get('terrain').value=options.terrain;get('view').value=options.view;get('observation-seconds').value=String(options.observationSeconds);get('interval').value=String(options.interval);get('auto-push').checked=options.autoPush;get('push-min').value=String(options.pushMin);get('push-max').value=String(options.pushMax);
function saveOptions(){try{localStorage.setItem('mydesk.robot.options',JSON.stringify({terrain:options.terrain,view:options.view,sensorVisible:options.sensorVisible,...normalizeEvaluationSettings(options),observationSeconds:options.observationSeconds,interval:options.interval,...normalizePushSettings(options),command,algorithm:options.algorithm,curriculum:options.curriculum,graphRange:options.graphRange,graphCustom:options.graphCustom,graphVersion:options.graphVersion,focus:stage}));}catch{}}
get('terrain').onchange=()=>{options.terrain=get('terrain').value;saveOptions();setZoom(1);panX=.4;panY=0;follow=options.view==='robot';configure(model);};
get('view').onchange=()=>{const next=get('view').value;if(next==='terrain'&&follow){panX=cameraX;panY=(groundPixel-canvas.getBoundingClientRect().height*.88)/drawScale-terrainDatum;}else if(next==='robot')panY=0;options.view=next;follow=next==='robot';saveOptions();};
get('focus').value=stage;get('algorithm').value=options.algorithm;get('curriculum').checked=options.curriculum;get('graph-range').value=options.graphRange;get('graph-custom').value=String(options.graphCustom);get('graph-custom-row').hidden=options.graphRange!=='custom';get('graph-version').value=options.graphVersion;
sharedStatus();syncCommandControls();settings();if(recoveryBlocked){initializing=false;controls();status('공용 모델 형식을 읽을 수 없습니다. 상세 옵션에서 초기화할 수 있습니다.');}else configure(model);
const sharedTimer=setInterval(()=>void refreshShared(),15000);sharedTimer.unref?.();
// The old login is retired; the public model never signs users in.
try{localStorage.removeItem('mydesk.robot.auth');}catch{}
