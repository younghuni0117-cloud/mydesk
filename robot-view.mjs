export function interpolateFrame(a,b,mix){
 const t=Math.max(0,Math.min(1,mix)),time=a.time+(b.time-a.time)*t,events=a.rewardEvents||b.rewardEvents?[...new Map([...(a.rewardEvents||[]),...(b.rewardEvents||[])].filter(e=>e.time<=time).map(e=>[e.id,e])).values()]:null;return {...a,...(a.vision&&b.vision?{vision:{eye:{x:a.vision.eye.x+(b.vision.eye.x-a.vision.eye.x)*t,y:a.vision.eye.y+(b.vision.eye.y-a.vision.eye.y)*t,angle:a.vision.eye.angle+Math.atan2(Math.sin(b.vision.eye.angle-a.vision.eye.angle),Math.cos(b.vision.eye.angle-a.vision.eye.angle))*t},samples:a.vision.samples.map((p,i)=>({x:p.x+(b.vision.samples[i].x-p.x)*t,y:p.y+(b.vision.samples[i].y-p.y)*t}))}}:{}),...(events?{rewardEvents:events}:{}),...(Number.isFinite(a.time)&&Number.isFinite(b.time)?{time:a.time+(b.time-a.time)*t}:{}),parts:a.parts.map((p,i)=>[p[0]+(b.parts[i][0]-p[0])*t,p[1]+(b.parts[i][1]-p[1])*t,p[2]+Math.atan2(Math.sin(b.parts[i][2]-p[2]),Math.cos(b.parts[i][2]-p[2]))*t])};
}
export function traceFrame(frames,time){
 let low=0,high=frames.length-1;while(low<high){const mid=Math.ceil((low+high)/2);if(frames[mid].time<=time)low=mid;else high=mid-1;}
 const a=frames[low],b=frames[Math.min(low+1,frames.length-1)];return interpolateFrame(a,b,b.time>a.time?(time-a.time)/(b.time-a.time):0);
}
export function chartDomain(rows){const values=rows.flatMap(r=>[r.overall,r.candidate]).filter(Number.isFinite);const low=Math.min(...values),high=Math.max(...values);if(!values.length)return[-100,100];const span=Math.max(4,high-low),mid=(low+high)/2;return [mid-span*.65,mid+span*.65];}

export function taskChartRows(model,task,rewardVersion=null,environment=null){const end=model.taskAttempts[task],trained=Object.keys(model.taskAttempts).filter(k=>model.taskAttempts[k]>0),singleTask=trained.length===1&&trained[0]===task,points=new Map();for(const r of model.history){if(environment!==null&&r.environment!==environment)continue;if(rewardVersion!==null&&(r.rewardVersion??1)!==rewardVersion)continue;if(!Number.isFinite(r.rewards?.[task]))continue;let count=r.taskAttempts?.[task];if(!Number.isSafeInteger(count)){if(singleTask)count=r.attempts;else if(r.attempts===model.attempts)count=end;else continue;}if(count<0||count>end)continue;const candidate=r.candidateRewards?.[task]??r.partialCandidateRewards?.[task];points.set(count,{attempts:count,overall:r.rewards[task],candidate:Number.isFinite(candidate)?candidate:r.validationComplete===false?null:r.rewards[task]});}return [...points.values()].sort((a,b)=>a.attempts-b.attempts);}

// Keep terminal feedback visible; the physics clock and learned reward stay unchanged.
export const PREVIEW_RESULT_HOLD=.8;
export function previewWindow(scene,stage){return Math.min(1.2,Math.max(0,scene?.metrics?.time??scene?.trace?.at(-1)?.time??0)+(stage==='balance'?0:PREVIEW_RESULT_HOLD));}
export function playbackFrame(scene,elapsed,stage){
 const frames=scene.trace,duration=Math.max(0,frames.at(-1)?.time??0),time=Math.max(0,elapsed);
 if(stage==='balance'&&duration>0){const cycle=Math.floor(time/duration),clock=time%duration,frame=traceFrame(frames,clock),events=(frame.rewardEvents||[]).map(e=>({...e,time:e.time+cycle*duration}));if(cycle>0)for(const e of frames.at(-1).rewardEvents||[])if(time-(e.time+(cycle-1)*duration)<.8)events.push({...e,time:e.time+(cycle-1)*duration});return {...frame,rewardTime:time,rewardEvents:events};}
 const clock=time%(duration+PREVIEW_RESULT_HOLD),frame=traceFrame(frames,Math.min(clock,duration));return {...frame,rewardTime:clock};
}

export function drawFurthestFlag(ctx,metrics,terrain,X,Y,offset=0){
 if(!Number.isFinite(metrics?.furthestX)||Math.abs(metrics.furthestDistance??0)<.03)return;
 const x=X(metrics.furthestX+offset),y=Y(Number.isFinite(metrics.contactY)?metrics.contactY:terrain(metrics.furthestX));ctx.save();ctx.strokeStyle='#a94444';ctx.fillStyle='#c95757';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-23);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y-23);ctx.lineTo(x+11,y-19);ctx.lineTo(x,y-15);ctx.closePath();ctx.fill();ctx.restore();
}
