// Run sequentially on both revisions on the same machine, with other tests stopped.
// node scripts/benchmark-robot.mjs [repository-root] [attempts] [JSON-output]
import {resolve,dirname} from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {writeFileSync} from 'node:fs';
const root=resolve(process.argv[2]||resolve(dirname(fileURLToPath(import.meta.url)),'..')),count=Number(process.argv[3]||36);
if(!Number.isInteger(count)||count<1||count>100000)throw Error('attempts must be an integer from 1 to 100000');
const {RobotLearner}=await import(pathToFileURL(root+'/robot-learning.mjs'));
const start=performance.now(),learner=new RobotLearner(null,42,{terrain:'meadow',courseVersion:10}),ready=performance.now();learner.setTrainingPushSettings({autoPush:true,pushMin:1,pushMax:6});learner.setTrainingCommand({mode:'hold'});
const trials=[];for(let i=0;i<count;i++){trials.push(learner.trainOne().score);if(learner.pending.length>=12)await learner.checkpointAsync();}await learner.checkpointAsync();
const end=performance.now(),result={initializeMs:ready-start,trainMs:end-ready,totalMs:end-start,count,policyVersion:learner.policyVersion,goalReward:learner.goalReward,rewards:Object.fromEntries(Object.entries(learner.abilities).map(([s,a])=>[s,a.meanReward])),weights:learner.weights,trials};
if(process.argv[4])writeFileSync(process.argv[4],JSON.stringify(result));console.log(JSON.stringify({...result,weights:undefined,trials:undefined},null,2));
