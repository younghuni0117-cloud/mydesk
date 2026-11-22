import {DogPPO} from './robotdog-ppo.mjs?v=dog21';
import {WEIGHTS} from './robotdog-rig.mjs?v=dog21';
export const POLICY_IDS=['balance','forward','backward','turn','recovery'];
export const POLICY_LABELS={balance:'균형',forward:'전진',backward:'후진',turn:'제자리 회전',recovery:'일어나기'};
export const FAMILY_GOALS={balance:['stand','push'],forward:['move'],backward:['backward'],turn:['turn'],recovery:['recover']};
export const policyId=goal=>goal==='recover'||goal==='recovery'?'recovery':['move','forward','gait'].includes(goal)?'forward':goal==='backward'?'backward':goal==='turn'?'turn':'balance';
export const familyGoal=id=>FAMILY_GOALS[id]?.[0]||'stand';
export const vectorValid=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
export function freshPolicies(){return Object.fromEntries(POLICY_IDS.map((id,i)=>{const ppo=new DogPPO(83+i*101);ppo.logStd.fill(id==='balance'?-1.3:id==='recovery'?-.6:-1);return[id,{weights:[...ppo.actor.w],learner:ppo.snapshot(),attempts:0,reward:0,success:0,best:null,metrics:{},recent:[],failures:[],evaluation:null,curriculum:{level:0,window:[],history:[],stale:0}}];}));}
export function validPolicy(v){return !!(v&&vectorValid(v.weights,WEIGHTS)&&v.learner?.version===1&&vectorValid(v.learner.actor,WEIGHTS)&&Number.isSafeInteger(v.attempts)&&v.attempts>=0&&[0,1,2,3].includes(v.curriculum?.level)&&Array.isArray(v.curriculum.window)&&Array.isArray(v.curriculum.history));}
export function validPolicies(p){return POLICY_IDS.every(id=>validPolicy(p?.[id]));}
export function mirrorPolicy(model,id){const p=model.policies[id];model.activePolicy=id;model.weights=[...p.weights];model.learner=p.learner;model.metrics={...p.metrics};model.best=p.best;return model;}
export function advanceCurriculum(p,success,evaluation,enabled,attempt){const c=p.curriculum;c.window.push(Number(success));c.window=c.window.slice(-20);if(!enabled||c.level>=3||c.window.length<12)return false;const rate=c.window.reduce((s,v)=>s+v,0)/c.window.length;if(rate>=.7&&evaluation?.success>=.5){const previous=c.level;c.level++;c.window=[];c.history.push({attempt,previous,level:c.level,reason:'최근 성공률 70% 이상·고정 조건 검증 50% 이상'});return true;}return false;}
// Commands are sampled once, then held for the entire episode. Early stages learn straight motion.
export function trainingCase(model,options,id,random){
 const p=model.policies[id],level=options.curriculum===false?3:p.curriculum.level,easy=options.curriculum!==false&&(level===0||random()<.25),index=p.attempts;
 const goal=id==='balance'?(level>0&&index%2?'push':'stand'):familyGoal(id),limit=Math.max(.1,Math.min(10,Number(options.target)||.4)),maxSpeed=Math.min(limit,easy?.4:[.4,1,3,10][level]),target=.1+(maxSpeed-.1)*random();
 const turnLimit=easy?.25:[.25,.5,.9,1.5][level],moving=id==='forward'||id==='backward',direction=index%3===0?0:index%3===1?-1:1;
 const yawRate=id==='turn'?(index%2?-1:1)*turnLimit:moving&&!easy&&level>=2?direction*(.15+random()*(turnLimit-.15)):0;
 const terrain=easy||level<2?'flat':options.randomization?.enabled&&options.randomization.terrains?Object.keys(options.terrains)[index%Object.keys(options.terrains).length]:options.terrain;
 const recoveryLevel=id==='recovery'?(easy?0:Math.min(2,level-1)):undefined;
 return {...options,goal,target,yawRate,terrain,recoveryLevel,pushStrength:easy?1:1+level*3,randomization:easy||level<2?{enabled:false}:options.randomization,frictionRange:easy||level<2?null:options.frictionRange,difficulty:level,easy};
}
export function evaluationCases(id){
 if(id==='balance')return[{key:'stand',label:'제자리 균형',goal:'stand'},{key:'push',label:'외력 대응',goal:'push',pushStrength:5}];
 if(id==='forward')return[{key:'straight',label:'느린 직진',goal:'move',target:.4,yawRate:0},{key:'running',label:'빠른 직진',goal:'move',target:2,yawRate:0},{key:'left',label:'전진·좌회전',goal:'move',target:.6,yawRate:-.6},{key:'right',label:'전진·우회전',goal:'move',target:.6,yawRate:.6}];
 if(id==='backward')return[{key:'straight',label:'뒤로 직진',goal:'backward',target:.3,yawRate:0},{key:'left',label:'후진·좌회전',goal:'backward',target:.3,yawRate:-.5},{key:'right',label:'후진·우회전',goal:'backward',target:.3,yawRate:.5}];
 if(id==='turn')return[{key:'left',label:'제자리 좌회전',goal:'turn',target:0,yawRate:-.6},{key:'right',label:'제자리 우회전',goal:'turn',target:0,yawRate:.6}];
 return[{key:'crouch',label:'웅크린 자세',goal:'recover',recoveryLevel:0},{key:'side',label:'옆으로 넘어진 자세',goal:'recover',recoveryLevel:1},{key:'supine',label:'뒤집힌 자세',goal:'recover',recoveryLevel:2}];
}
