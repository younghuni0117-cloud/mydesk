const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const RECOVERY_OBJECTIVE_VERSION=2;
export const RECOVERY_TEST_STARTS=Object.freeze(['seated','kneeling','lying-front','lying-back']);
export const recoveryTestStart=(index,count=4)=>RECOVERY_TEST_STARTS[(count<=2?2:0)+index%Math.min(count<=2?2:4,4)];
export function recoveryPotential(height,torsoAngle){return clamp((height-.15)/.75)*Math.max(0,Math.cos(torsoAngle))**2;}
export function recoveryLimitCost(motors,facing=1){return motors.filter(m=>m.name==='waist'||m.name.endsWith('Hip')).reduce((sum,m)=>{const angle=m.joint.getJointAngle()*facing,limit=Math.abs(angle<0?m.lower:m.upper);return sum+clamp((Math.abs(angle)/Math.max(.001,limit)-.8)/.2)**2;},0)/3;}
export function recoveryLyingProbability(practice={},curriculum=true){return curriculum?.1+.65*clamp(practice.successRate||0):.6;}
// These are initial states only. No motor targets, warm-up or action sequence.
export function recoveryStart(random,options={}){
 const choice=random(),side=random(),u=()=>random(),range=(a,b)=>a+(b-a)*u();
 const kind=RECOVERY_TEST_STARTS.includes(options.recoveryStart)||options.recoveryStart==='crouched'?options.recoveryStart:choice<(options.recoveryLyingProbability??.15)?(side<.5?'lying-front':'lying-back'):['seated','kneeling','crouched'][Math.min(2,Math.floor(side*3))];
 const lying=kind.startsWith('lying'),angle=lying?(kind==='lying-front'?Math.PI/2:-Math.PI/2)+range(-.12,.12):range(-.18,.18),joints={waist:range(-.12,.12),neck:range(-.2,.2)};
 for(const s of ['left','right']){
  joints[s+'Hip']=lying?range(.05,.35):kind==='seated'?range(1.55,1.85):kind==='kneeling'?range(.65,.95):range(1.1,1.4);
  joints[s+'Knee']=lying?range(-.6,-.1):kind==='seated'?range(-1.65,-1.25):kind==='kneeling'?range(-2.5,-2.25):range(-2.4,-2.1);
  joints[s+'Ankle']=lying?range(-.15,.15):kind==='seated'?range(-.3,.1):range(.7,1);
  joints[s+'Shoulder']=lying?range(.02,.2):range(.1,1.2);joints[s+'Elbow']=lying?range(.05,.3):range(.2,1.3);
 }return {kind,angle,joints};
}
export function updateRecoveryPractice(previous={},metrics){const success=metrics.terminationReason==='duration'&&metrics.recoveries>=1&&metrics.finalUpright===true&&!metrics.recovering&&metrics.stableTime+1e-6>=2;const result={...previous,trials:(previous.trials||0)+1,successRate:(previous.successRate||0)*.95+(success?.05:0)};if(success&&metrics.recoveryAssistAutoReduce===true&&(metrics.recoveryAssistMaxUsed>0||metrics.recoveryStart?.startsWith('lying'))){const scale=clamp((previous.assistScale??1)*.8);result.assistScale=scale<.03?0:scale;}return result;}

// Training scaffold only; validation and integrated execution never enable it.
export function recoveryAssistOptions(profile={},practice={},offset=0){
 const raw=Number(profile.recoveryAssistForce??120),maximum=Number.isFinite(raw)?clamp(raw,0,500):120,auto=profile.recoveryAssistAutoReduce!==false;
 const probe=((practice.trials||0)+offset+1)%4===0;
 return {recoveryAssistTraining:true,recoveryAssistAutoReduce:auto,recoveryAssistForce:probe?0:maximum*(auto?clamp(practice.assistScale??1):1)};
}
export function recoveryAssistOutput({force,height,verticalSpeed,stallSeconds,rampSeconds}){
 return force*clamp((stallSeconds-1.2)/.5)*clamp((.85-height)/.3)*clamp((.9-verticalSpeed)/.5)*clamp(rampSeconds/.5);
}
