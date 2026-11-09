export const REWARD_FEEDBACK_INTERVAL=.5,REWARD_FEEDBACK_LIFETIME=.8;
const group=body=>body.includes('Toe')?body.startsWith('left')?'leftFoot':'rightFoot':body;
export class RewardFeedback {
 constructor(){this.pending=new Map();this.events=[];this.sequence=0;this.lastFlush=0;}
 collect(time,terms,locate,immediate=false){
  for(const [term,value] of Object.entries(terms)){if(!Number.isFinite(value)||value===0)continue;const points=locate(term),total=points.reduce((sum,p)=>sum+p.weight,0)||1;
   for(const p of points){const amount=value*p.weight/total;if(!amount)continue;const key=group(p.body)+':'+Math.sign(amount),weight=Math.abs(amount),row=this.pending.get(key)||{value:0,x:0,y:0,weight:0,body:group(p.body)};row.value+=amount;row.x+=p.point[0]*weight;row.y+=p.point[1]*weight;row.weight+=weight;this.pending.set(key,row);}
  }
  if(immediate||time-this.lastFlush>=REWARD_FEEDBACK_INTERVAL-1e-8){for(const p of this.pending.values())this.events.push({id:++this.sequence,time,value:p.value,point:[p.x/p.weight,p.y/p.weight],body:p.body});this.pending.clear();this.lastFlush=time;}
  this.events=this.events.filter(e=>time-e.time<=REWARD_FEEDBACK_LIFETIME+1e-8);
 }
 snapshot(){return this.events.map(e=>({...e,point:[...e.point]}));}
}
// Location is explanatory credit attribution: global posture/control costs belong to the torso.
export function rewardLocations(world,term,distal){
 const at=(body,weight=1)=>{const p=(world.parts[body]||world.parts.torso).getWorldCenter();return {body,weight,point:[p.x,p.y]};};
 if(term==='gaze')return [at('head')];
 if(term==='standing'||term==='support')return [at('leftFoot'),at('rightFoot')];
 if(['movement','speed','overspeed','arrival'].includes(term))return [at('pelvis')];
 if(term==='push')return [at(world.impactEvents.at(-1)?.location||'torso')];
 if(term==='impact'&&world.rewardContactPoints?.length)return world.rewardContactPoints;
 if(term==='distalMotion'||term==='distalChange'){const key=term==='distalMotion'?'motion':'change',rows=distal.parts?.filter(p=>p[key]>0).map(p=>at(p.body,p[key]));if(rows?.length)return rows;}
 return [at('torso')];
}
export function rewardPopups(frame){return (frame.rewardEvents||[]).filter(e=>Math.abs(e.value)>=1&&frame.time>=e.time&&frame.time-e.time<REWARD_FEEDBACK_LIFETIME).map(e=>{const age=(frame.time-e.time)/REWARD_FEEDBACK_LIFETIME;return {...e,opacity:Math.min(1,(1-age)*3),rise:age*26};});}
export function rewardText(value){const n=Math.abs(value);return n?(value>0?'+':'−')+(n>=10?Number(n.toFixed(0)):Number(n.toPrecision(2))):'';}
export function drawRewardPopups(ctx,frame,X,Y){
 const occupied=[];ctx.save();ctx.font='600 11px "Noto Sans KR", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
 for(const e of rewardPopups(frame)){const text=rewardText(e.value),width=ctx.measureText(text).width+5,x=X(e.point[0])+(e.value>0?-10:10);let y=Y(e.point[1])-10-e.rise;for(let tries=0;tries<6&&occupied.some(b=>Math.abs(x-b.x)<(width+b.width)/2&&Math.abs(y-b.y)<13);tries++)y-=14;occupied.push({x,y,width});ctx.globalAlpha=e.opacity;ctx.lineWidth=2.5;ctx.strokeStyle='#ffffffdf';ctx.strokeText(text,x,y);ctx.fillStyle=e.value>0?'#2873c2':'#cb4850';ctx.fillText(text,x,y);}
 ctx.restore();
}
