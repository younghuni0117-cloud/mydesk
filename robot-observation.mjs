// Physics lives in its own worker. The page only receives small pose snapshots.
export class RobotObservation{
 constructor(factory=()=>new Worker(new URL('./robot-observation-worker.mjs?v=update86',import.meta.url),{type:'module'})){
  this.factory=factory;this.worker=null;this.generation=0;this.loading=false;this.ready=false;this.paused=true;this.world=null;this.previous=null;this.current=null;this.received=0;
 }
 start(stage,options,weights){this.generation++;this.loading=true;this.ready=false;this.paused=false;
  if(!this.worker){this.worker=this.factory();this.worker.onmessage=({data})=>this.receive(data);this.worker.onerror=()=>{this.worker?.terminate();this.worker=null;this.loading=false;this.ready=false;this.onerror?.('관찰 화면을 준비하지 못했습니다. 통합 모델 실행을 다시 눌러 주세요.');};}
  this.worker.postMessage({type:'start',generation:this.generation,stage,options,weights});
 }
 receive(data){if(data.generation!==this.generation)return;
  if(data.type==='error'){this.loading=false;this.ready=false;this.onerror?.(data.message);return;}
  if(data.type!=='ready'&&data.type!=='frame')return;this.previous=data.previous||data.frame;this.current=data.frame;this.received=performance.now();
  if(data.type==='ready'){const self=this,world={stage:data.stage,duration:data.duration,terrain:data.terrain,obstacles:data.obstacles,pushes:data.pushes,parts:{},metrics:()=>self.current.metrics,push:(...args)=>self.push(...args),setCommand:command=>self.command(command)};Object.defineProperty(world,'done',{get:()=>!!self.current?.metrics.done});for(const [index,part]of data.geometry.parts.entries())world.parts[part.name]={getPosition:()=>({x:self.current.parts[index][0],y:self.current.parts[index][1]})};this.world=world;this.loading=false;this.ready=true;this.onready?.(world,data);if(this.paused)this.worker?.postMessage({type:'pause',generation:this.generation,paused:true});}
  this.onframe?.(data);
 }
 mix(now=performance.now()){const milliseconds=Math.max(1000/60,((this.current?.time||0)-(this.previous?.time||0))*1000);return Math.max(0,Math.min(1,(now-this.received)/milliseconds));}
 setPaused(paused){if(paused===this.paused)return;this.paused=paused;if(!this.ready)return;this.worker.postMessage({type:'pause',generation:this.generation,paused});}
 push(...args){this.worker?.postMessage({type:'push',generation:this.generation,args});}
 command(command){this.worker?.postMessage({type:'command',generation:this.generation,command});}
 stop(){this.worker?.postMessage({type:'stop',generation:this.generation});this.generation++;this.loading=false;this.ready=false;this.world=null;}
 terminate(){this.generation++;this.worker?.terminate();this.worker=null;this.loading=false;this.ready=false;this.world=null;}
}
