import {DogPPO} from './robotdog-ppo.mjs?v=dog17';
import {GOAL_IDS,WEIGHTS} from './robotdog-rig.mjs?v=dog17';
export const POLICY_IDS=['balance','gait','recovery'];
export const POLICY_LABELS={balance:'균형',gait:'보행',recovery:'일어나기'};
export const FAMILY_GOALS={balance:['stand','push'],gait:['move','backward','turn'],recovery:['recover']};
export const policyId=goal=>goal==='recover'||goal==='recovery'?'recovery':['move','backward','turn','gait'].includes(goal)?'gait':'balance';
export const familyGoal=id=>id==='gait'?'move':id==='recovery'?'recover':'stand';
export const vectorValid=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
export function freshPolicies(){return Object.fromEntries(POLICY_IDS.map((id,i)=>{const ppo=new DogPPO(83+i*101);ppo.logStd.fill(id==='balance'?-1.3:id==='recovery'?-.6:-1);return[id,{weights:[...ppo.actor.w],learner:ppo.snapshot(),attempts:0,reward:0,success:0,best:null,metrics:{},recent:[],failures:[],evaluation:null,curriculum:{level:0,window:[],history:[],stale:0}}];}));}
export function validPolicies(p){return POLICY_IDS.every(id=>{const v=p?.[id];return v&&vectorValid(v.weights,WEIGHTS)&&v.learner?.version===1&&vectorValid(v.learner.actor,WEIGHTS)&&Number.isSafeInteger(v.attempts)&&v.attempts>=0&&[0,1,2,3].includes(v.curriculum?.level)&&Array.isArray(v.curriculum.window)&&Array.isArray(v.curriculum.history);});}
export function mirrorPolicy(model,id){const p=model.policies[id];model.activePolicy=id;model.weights=[...p.weights];model.learner=p.learner;model.metrics={...p.metrics};model.best=p.best;return model;}
export function advanceCurriculum(p,success,evaluation,enabled,attempt){const c=p.curriculum;c.window.push(Number(success));c.window=c.window.slice(-20);if(!enabled||c.level>=3||c.window.length<12)return false;const rate=c.window.reduce((s,v)=>s+v,0)/c.window.length;if(rate>=.7&&evaluation?.success>=.5){const previous=c.level;c.level++;c.window=[];c.history.push({attempt,previous,level:c.level,reason:'최근 성공률 70% 이상·고정 조건 검증 50% 이상'});return true;}return false;}
// Earlier easy cases remain in every level; training difficulty never changes held-out evaluation cases.
export function trainingCase(model,options,id,random){
 const p=model.policies[id],level=options.curriculum===false?3:p.curriculum.level,easy=options.curriculum!==false&&(level===0||random()<.25),goals=FAMILY_GOALS[id],index=p.attempts;
 const goal=id==='balance'?(level>0&&index%2?'push':'stand'):id==='recovery'?'recover':easy?'move':goals[index%goals.length];
 const limit=Math.min(10,options.target||.4),maxSpeed=Math.max(.1,Math.min(limit,easy?.4:[.4,1,3,10][level])),target=.1+(maxSpeed-.1)*random(),yawRate=goal==='turn'?(random()<.5?-1:1)*(.25+1.25*level/3):!easy&&id==='gait'?(random()-.5)*3*level/3:0;
 const terrain=easy||level<2?'flat':options.randomization?.enabled&&options.randomization.terrains?Object.keys(options.terrains)[index%Object.keys(options.terrains).length]:options.terrain;
 const recoveryLevel=id==='recovery'?(easy?0:Math.min(2,level-1)):undefined;
 return {...options,goal,target,yawRate,terrain,recoveryLevel,pushStrength:easy?1:1+level*3,randomization:easy||level<2?{enabled:false}:options.randomization,frictionRange:easy||level<2?null:options.frictionRange,difficulty:level,easy};
}
