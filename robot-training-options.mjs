export function normalizeBalanceTraining(raw={}){const every=Number(raw?.balanceFullEvery),seconds=Number(raw?.trainingSeconds);return {trainingSeconds:Number.isInteger(seconds)&&seconds>=1&&seconds<=120?seconds:10,balanceEarlyStop:raw?.balanceEarlyStop!==false,balanceFullTrials:raw?.balanceFullTrials!==false,balanceFullEvery:Number.isInteger(every)&&every>=1&&every<=10000?every:8};}
// Periods are real trials in both algorithms. CEM retains matched L/R pairs.
export function fullTrialPeriod(every,algorithm){return algorithm==='cem'?Math.max(2,2*Math.ceil(every/2)):every;}
export function endBalanceTrialEarly(raw,algorithm,balanceTrialIndex){const s=normalizeBalanceTraining(raw);if(!s.balanceEarlyStop)return false;if(!s.balanceFullTrials)return true;const period=fullTrialPeriod(s.balanceFullEvery,algorithm);return algorithm==='cem'?(Math.floor(balanceTrialIndex/2)+1)%(period/2)!==0:(balanceTrialIndex+1)%period!==0;}
export const effectiveTrainingPush=({stage,autoPush,curriculum,horizon,trainingSeconds})=>autoPush!==false&&!(stage==='balance'&&curriculum&&horizon<trainingSeconds);
export const MAX_TRAINING_ROBOTS=5;
export const normalizeRobotCount=value=>Number.isInteger(Number(value))?Math.max(1,Math.min(MAX_TRAINING_ROBOTS,Number(value))):1;
// Complete a collection cohort before updating its shared PPO actor. At long
// horizons the temporary experience budget expands for at most five episodes.
export function samplingBatchSize(seconds,hz,count=1){const n=normalizeRobotCount(count),base=Math.max(1,Math.min(8,Math.floor(3840/(seconds*hz))));return base<n?n:Math.floor(base/n)*n;}
