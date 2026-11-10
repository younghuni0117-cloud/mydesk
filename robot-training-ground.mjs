// A reproducible curriculum of simple courses. Nothing here commands a joint.
export const TRAINING_COURSES=Object.freeze(['flat','uphill','downhill','slopes','stones','lowSteps','highSteps','lowStepsDown','highStepsDown']);
export const COURSE_LABELS=Object.freeze({flat:'평지',uphill:'오르막',downhill:'내리막',slopes:'다양한 경사',stones:'돌길',lowSteps:'낮은 오르막 계단',highSteps:'높은 오르막 계단',lowStepsDown:'낮은 내리막 계단',highStepsDown:'높은 내리막 계단'});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),rng=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
export function normalizeGround(raw={}){const n=(k,a,b,d)=>Number.isFinite(Number(raw[k]))?clamp(Number(raw[k]),a,b):d;const low=n('frictionMin',0,2,.2),high=Math.max(low,n('frictionMax',0,2,1.3));return {changeEvery:Math.round(n('changeEvery',1,1000,1)),mixMode:['selected','together','random'].includes(raw.mixMode)?raw.mixMode:(Number(raw.focusRatio)===1?'selected':'together'),slopeMax:n('slopeMax',5,35,24),stepMax:n('stepMax',.08,.3,.22),frictionMin:low,frictionMax:high,massVariation:n('massVariation',0,.3,.15),pushProbability:n('pushProbability',0,1,.65),pushInterval:n('pushInterval',.5,30,3),pushMax:n('pushMax',.1,15,4),};}
export function mixedTask(focus,index,seed,raw={}){const {mixMode}=normalizeGround(raw),tasks=['balance','recover','walk','run','obstacles'],first=Math.max(0,tasks.indexOf(focus));if(mixMode==='selected')return tasks[first];if(mixMode==='random')return tasks[Math.floor(rng((seed+Math.imul(index+1,104729))>>>0)()*tasks.length)];return tasks[(first+index)%tasks.length];}
export function trainingCondition(index=0,seed=42,raw={},difficulty=1){const s=normalizeGround(raw),group=Math.floor(index/s.changeEvery),safeBag=[...TRAINING_COURSES],cycle=Math.floor(group/safeBag.length),order=[...safeBag],shuffle=rng((seed+Math.imul(cycle+1,104729))>>>0);for(let i=order.length-1;i>0;i--){const j=Math.floor(shuffle()*(i+1));[order[i],order[j]]=[order[j],order[i]];}const random=rng((seed+Math.imul(group+1,2654435761))>>>0),level=clamp(difficulty,.15,1),vary=amount=>1+(random()*2-1)*amount*level,course=order[group%order.length];return {course,label:COURSE_LABELS[course],seed:(seed+group*7919)>>>0,angle:(5+(s.slopeMax-5)*level)*(.55+.45*random()),step:(course.startsWith('highSteps')?s.stepMax:.08)*(.65+.35*level),friction:s.frictionMax-(s.frictionMax-s.frictionMin)*random()*level,massScales:Array.from({length:13},()=>vary(s.massVariation)),pushEnabled:random()<s.pushProbability,pushInterval:s.pushInterval,pushMax:.5+(s.pushMax-.5)*level,level};}
export const TRAINING_EXTENT=Object.freeze({left:-8,right:12});
export const STAIR_TREAD=.8;
export const isTrainingStair=course=>course?.includes('Steps')===true;
export function makeTrainingTerrain(spec){
 const random=rng(spec.seed),segments=[],obstacles=[],decorations=[],base=.16,stairs=isTrainingStair(spec.course),down=spec.course.endsWith('Down'),left=TRAINING_EXTENT.left,right=TRAINING_EXTENT.right;
 if(stairs){
  // Thirteen treads; x=0 is the centre of the middle tread and the flight.
  const count=13,edge=-count*STAIR_TREAD/2,height=i=>base+(down?count-1-i:i)*spec.step;
  segments.push({x0:left,x1:edge,y0:height(0),y1:height(0)});
  for(let i=0;i<count;i++)segments.push({x0:edge+i*STAIR_TREAD,x1:edge+(i+1)*STAIR_TREAD,y0:height(i),y1:height(i)});
  segments.push({x0:edge+count*STAIR_TREAD,x1:right,y0:height(count-1),y1:height(count-1)});
 }else{
  let x=left,y=base;const tan=Math.tan(spec.angle*Math.PI/180);
  while(x<right){const next=Math.min(right,x+.4);if(next-x<1e-5)break;const slope=spec.course==='uphill'?tan:spec.course==='downhill'?-tan:spec.course==='slopes'?Math.sin((x+.2)/3)*tan:spec.course==='stones'?Math.sin(x/4)*.06:0;segments.push({x0:x,x1:next,y0:y,y1:y+slope*(next-x)});y+=slope*(next-x);x=next;}
 }
 const minimum=Math.min(...segments.map(s=>Math.min(s.y0,s.y1))),offset=base-minimum;for(const s of segments){s.y0+=offset;s.y1+=offset;}
 const merged=[];for(const current of segments){const last=merged.at(-1),slope=(current.y1-current.y0)/(current.x1-current.x0);if(last&&Math.abs(last.y1-current.y0)<1e-8&&Math.abs((last.y1-last.y0)/(last.x1-last.x0)-slope)<1e-8){last.x1=current.x1;last.y1=current.y1;}else merged.push({...current});}
 // Flat safety aprons avoid an artificial cliff at the compact course ends.
 merged.unshift({x0:-64,x1:left,y0:merged[0].y0,y1:merged[0].y0});merged.push({x0:right,x1:96,y0:merged.at(-1).y1,y1:merged.at(-1).y1});
 if(spec.course==='stones')for(let x=left+.15,i=0;x<right-.1;x+=.14+random()*.1,i++)obstacles.push({x,width:.09+random()*.12,height:.015+random()*.085*spec.level,side:i%2?'left':'right',shape:'rock',rounded:true,variant:random(),material:'stone'});
 // Keep a stone beneath each projected sole instead of clearing the spawn area.
 if(spec.course==='stones')for(const side of ['left','right']){const stone=obstacles.filter(o=>o.side===side).reduce((a,b)=>Math.abs(a.x-.07)<Math.abs(b.x-.07)?a:b);stone.x=.07;stone.width=Math.max(.18,stone.width);}obstacles.sort((a,b)=>a.x-b.x);
 return {kind:'training',course:spec.course,label:COURSE_LABELS[spec.course]||spec.label,variant:spec.seed%4,segments:merged,obstacles,decorations,ceilings:[],puddles:[],friction:spec.friction,stairHeight:stairs?spec.step:0,stairDirection:stairs?(down?-1:1):0,extent:TRAINING_EXTENT,relief:Math.max(...merged.map(s=>Math.max(s.y0,s.y1)))};
}
export function trainingTerrainInfo(terrain,metrics={},x=0){const segment=terrain.segments.find(s=>x>=s.x0&&x<=s.x1),slope=terrain.stairDirection?terrain.stairDirection*(terrain.stairHeight||0)/STAIR_TREAD:segment?(segment.y1-segment.y0)/(segment.x1-segment.x0):0;return {label:terrain.label,angle:Math.atan(slope)*180/Math.PI,step:terrain.stairHeight||0,direction:terrain.stairDirection||0,friction:terrain.friction,massChange:Number.isFinite(metrics.mass)?(metrics.mass/19.9-1)*100:null,delay:0};}

export const GROUND_TESTS=Object.freeze([{id:'ground-fixed-flat',course:'flat',angle:8,friction:1.1},{id:'ground-fixed-up',course:'uphill',angle:12,friction:.7},{id:'ground-fixed-down',course:'downhill',angle:10,friction:.45},{id:'ground-fixed-steps',course:'lowSteps',angle:8,friction:1},{id:'ground-fixed-stones',course:'stones',angle:8,friction:.8}]);
export function groundTestSpec(index=0){return {...trainingCondition(index,98173,{},.6),...GROUND_TESTS[index%GROUND_TESTS.length],label:COURSE_LABELS[GROUND_TESTS[index%GROUND_TESTS.length].course],seed:98173+index,step:.09,massScales:Array(13).fill(1),pushEnabled:false};}
// Fixed tests and held-out tests have separate seeds and physics. They never
// contribute gradients, and candidates/champions always see identical conditions.
export function validationGround(test,index=0){if(test?.trainingSpec)return test.trainingSpec;if(test?.id?.startsWith('unseen'))return {...trainingCondition(index,test.seed+390731,{massVariation:.2},.8),course:index?'highStepsDown':'stones',label:index?'미경험 내리막 계단 시험':'미경험 돌길 시험',step:.16};return groundTestSpec(index);}
export function terrainReviewCases(seconds=10){return GROUND_TESTS.map((test,index)=>({id:test.id,label:COURSE_LABELS[test.course],seed:98173+index,seconds,pushes:[],trainingSpec:groundTestSpec(index)}));}
