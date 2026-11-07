export function interpolateFrame(a,b,mix){
 const t=Math.max(0,Math.min(1,mix));return {...a,parts:a.parts.map((p,i)=>[p[0]+(b.parts[i][0]-p[0])*t,p[1]+(b.parts[i][1]-p[1])*t,p[2]+Math.atan2(Math.sin(b.parts[i][2]-p[2]),Math.cos(b.parts[i][2]-p[2]))*t])};
}
export function traceFrame(frames,time){
 let low=0,high=frames.length-1;while(low<high){const mid=Math.ceil((low+high)/2);if(frames[mid].time<=time)low=mid;else high=mid-1;}
 const a=frames[low],b=frames[Math.min(low+1,frames.length-1)];return interpolateFrame(a,b,b.time>a.time?(time-a.time)/(b.time-a.time):0);
}
export function chartDomain(rows){const values=rows.flatMap(r=>[r.overall,r.candidate]).filter(Number.isFinite);const low=Math.min(...values),high=Math.max(...values);if(!values.length)return[-100,100];const span=Math.max(4,high-low),mid=(low+high)/2;return [mid-span*.65,mid+span*.65];}

export function taskChartRows(model,task){const end=model.taskAttempts[task],trained=Object.keys(model.taskAttempts).filter(k=>model.taskAttempts[k]>0),singleTask=trained.length===1&&trained[0]===task,points=new Map();for(const r of model.history){if(!Number.isFinite(r.rewards?.[task]))continue;let count=r.taskAttempts?.[task];if(!Number.isSafeInteger(count)){if(singleTask)count=r.attempts;else if(r.attempts===model.attempts)count=end;else continue;}if(count<0||count>end)continue;const candidate=r.candidateRewards?.[task]??r.partialCandidateRewards?.[task];points.set(count,{attempts:count,overall:r.rewards[task],candidate:Number.isFinite(candidate)?candidate:r.validationComplete===false?null:r.rewards[task]});}return [...points.values()].sort((a,b)=>a.attempts-b.attempts);}
