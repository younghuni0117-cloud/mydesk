const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const number=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
export function normalizeCommand(raw={}){return {mode:['hold','move','position'].includes(raw.mode)?raw.mode:'hold',direction:Number(raw.direction)===-1?-1:1,speed:clamp(number(raw.speed,.55),.05,2.5),position:clamp(number(raw.position,3),-30,30),posture:raw.posture==='low'?'low':'free'};}
export function commandLabel(raw){const c=normalizeCommand(raw);return (c.mode==='hold'?'제자리 유지':c.mode==='move'?`${c.direction>0?'앞으로':'뒤로'} ${c.speed.toFixed(2)}m/s`:`목표 ${c.position.toFixed(1)}m · 최대 ${c.speed.toFixed(2)}m/s`)+(c.posture==='low'?' · 낮은 자세':'');}
// Goals set desired outcomes only. No joint angles, poses, forces or motion sequences.
export function commandState(command,x,anchor,defaultSpeed=0){
 if(!command)return {target:defaultSpeed,error:0,positioned:false,low:false,distance:x-anchor};
 const c=normalizeCommand(command),targetX=c.mode==='hold'?anchor:c.position,error=targetX-x,positioned=c.mode!=='move';
 return {target:c.mode==='move'?c.direction*c.speed:c.mode==='hold'||Math.abs(error)<.15?0:clamp(error*1.5,-c.speed,c.speed),error:positioned?error:0,positioned,low:c.posture==='low',distance:positioned?-error:x-anchor};
}
// Each CEM cohort sees the same task/goal mixture. Later cohorts change the goal,
// and the midpoint command changes without resetting the body or its momentum.
export function trainingCommands(stage,batch){
 if(batch%3===0)return [];
 const n=Math.floor(batch/3),speed=stage==='run'?1.4:stage==='walk'||stage==='obstacles'?.55:.3,low=batch%3===2;
 if(n%3===0)return [{time:0,command:{mode:'move',direction:-1,speed,posture:low?'low':'free'}},{time:4,command:{mode:'hold',posture:low?'low':'free'}}];
 if(n%3===1)return [{time:0,command:{mode:'position',position:n%2?3:-3,speed,posture:low?'low':'free'}}];
 return [{time:0,command:{mode:'move',direction:1,speed,posture:low?'low':'free'}},{time:4,command:{mode:'move',direction:-1,speed,posture:low?'low':'free'}}];
}
export const COMMAND_CASES=[
 {id:'reverse-stop',schedule:[{time:0,command:{mode:'move',direction:-1,speed:.4}},{time:4,command:{mode:'hold'}}]},
 {id:'arrive',schedule:[{time:0,command:{mode:'position',position:2,speed:.55}}]},
 {id:'low',schedule:[{time:0,command:{mode:'move',direction:1,speed:.3,posture:'low'}}]},
 {id:'turn',schedule:[{time:0,command:{mode:'move',direction:1,speed:.55}},{time:4,command:{mode:'move',direction:-1,speed:.4}}]},
];
