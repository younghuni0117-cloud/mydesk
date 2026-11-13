import {createRobotWorld,robotGeometry,DT} from './robot-core.mjs?v=update86';
let generation=0,world=null,weights=null,timer=null,buildTimer=null,paused=true,clock=0,carry=0,lastFrame=null,pending=[],startData=null;
const emit=data=>postMessage({...data,generation});
const cancelTimer=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
function snapshot(){const frame=world.snapshot(),vision=world.lastVision;if(vision)frame.vision={eye:{...vision.eye},samples:vision.samples.map(p=>({x:p.x,y:p.y}))};return frame;}
function apply(data){if(data.type==='push')world.push(...data.args);else if(data.type==='command')world.setCommand(data.command);}
function tick(){timer=null;if(paused||!world||world.done)return;const now=performance.now();carry=Math.min(carry+(now-clock),DT*2000);clock=now;const start=now;let count=0;while(carry>=DT*1000&&count<2&&!world.done){world.step(weights,false);carry-=DT*1000;count++;if(performance.now()-start>=8)break;}
 if(count){const frame=snapshot();emit({type:'frame',previous:lastFrame,frame});lastFrame=frame;}
 if(!world.done)timer=setTimeout(tick,16);
}
function build(){buildTimer=null;const data=startData;try{world=createRobotWorld(data.stage,data.options);weights=data.weights;for(const item of pending)apply(item);pending=[];lastFrame=snapshot();clock=performance.now();carry=0;paused=false;emit({type:'ready',stage:world.stage,duration:world.duration,frame:lastFrame,geometry:robotGeometry(world),terrain:world.terrain,obstacles:world.obstacles,pushes:world.pushes});timer=setTimeout(tick,16);}catch(error){emit({type:'error',message:error.message});}}
self.onmessage=({data})=>{
 if(data.type==='start'){generation=data.generation;cancelTimer();if(buildTimer!==null)clearTimeout(buildTimer);world=null;pending=[];paused=true;startData=data;buildTimer=setTimeout(build,16);return;}
 if(data.generation!==generation)return;
 if(data.type==='pause'){paused=data.paused;cancelTimer();clock=performance.now();carry=0;if(!paused&&world&&!world.done)timer=setTimeout(tick,16);emit({type:'paused',paused});return;}
 if(data.type==='stop'){cancelTimer();if(buildTimer!==null)clearTimeout(buildTimer);buildTimer=null;world=null;pending=[];paused=true;emit({type:'stopped'});return;}
 if(data.type==='push'||data.type==='command'){if(world)apply(data);else pending.push(data);}
};
