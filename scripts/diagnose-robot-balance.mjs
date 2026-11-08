// node scripts/diagnose-robot-balance.mjs [attempts=4096] [seed=42] [cem|ppo] [output.json] [resume-model.json]
// This runs real physics, not a mocked reward or a pre-trained posture controller.
import {readFileSync,writeFileSync} from 'node:fs';
import {RobotLearner} from '../robot-learning.mjs';
import {executeTrial} from '../robot-rollouts.mjs';
import {episode,MONITOR_CASES} from '../robot-core.mjs';
const count=Number(process.argv[2]||4096),seed=Number(process.argv[3]||42),algorithm=process.argv[4]||'cem',out=process.argv[5]||'/tmp/robot-balance-diagnostic.json';
if(!Number.isSafeInteger(count)||count<1||count>100000||!Number.isSafeInteger(seed)||!['cem','ppo'].includes(algorithm))throw Error('Invalid arguments');
const saved=process.argv[6]?JSON.parse(readFileSync(process.argv[6],'utf8')).model:null,l=new RobotLearner(saved,seed,{terrain:'meadow',courseVersion:10});
l.setAlgorithm(algorithm);l.setTrainingPushSettings({autoPush:true,pushMin:1,pushMax:6});l.setCurriculum(true);
const summarize=a=>({meanStandingSeconds:a.cases.reduce((s,c)=>s+c.metrics.upright*c.metrics.time,0)/a.cases.length,standingSeconds:a.cases.map(c=>c.metrics.upright*c.metrics.time),longestSeconds:a.cases.map(c=>c.metrics.longestUpright),passRate:a.passRate,meanReward:a.meanReward});
const initial=summarize(l.abilities.balance),start=performance.now();let physicalSeconds=0;
for(let i=0;i<count;i++){const p=l.prepareTrial(),trial=executeTrial(p);physicalSeconds+=trial.metrics.time;l.completeTrial(p,trial);if(l.pending.length>=l.batchSize)await l.checkpointAsync(undefined,undefined,null,i===count-1);if(i%512===511)console.log(JSON.stringify({attempts:l.attempts,...summarize(l.abilities.balance)}));}
if(l.pending.length||l.validationBank)await l.checkpointAsync(undefined,undefined,null,true);
const heldOut=MONITOR_CASES.map(c=>({id:c.id,...episode(l.weights,'balance',c.seed,{terrain:'meadow',pushes:c.pushes,disturbances:false,summaryOnly:true}).metrics}));
const result={algorithm,seed,newAttempts:count,totalAttempts:l.attempts,initial,selected:summarize(l.abilities.balance),heldOut,physicalSeconds,elapsedMs:performance.now()-start,valid:RobotLearner.valid(l.snapshot()),note:'Fixed full 8-second validation. Different reward/physics versions are not directly comparable. A diagnostic does not prove convergence or success after 100000 attempts.'};
writeFileSync(out,JSON.stringify(result,null,2));writeFileSync(out.replace(/\.json$/,'')+'-model.json',JSON.stringify({format:'mydesk-robot-v5',model:l.snapshot()}));console.log(JSON.stringify(result));
