export const REWARD_FEEDBACK_INTERVAL=1,REWARD_FEEDBACK_LIFETIME=.8;
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
export function robotPartBounds(frame,parts,X,Y,skin='explorer'){
 const scale=Math.abs(X(1)-X(0)),out=[];
 for(let i=0;i<(parts?.length||0);i++){const part=parts[i],p=frame.parts?.[i];if(!p)continue;const shapes=[{...part,x:0,y:0},...(part.attachments||[])];for(const shape of shapes){const c=Math.cos(p[2]),s=Math.sin(p[2]),x=p[0]+c*shape.x-s*shape.y,y=p[1]+s*shape.x+c*shape.y,w=shape.w*(skin==='hiker'?(shape.name.includes('Thigh')?2:shape.name.includes('Shin')?1.8:shape.name.includes('UpperArm')?1.65:shape.name.includes('Forearm')?1.6:1):1),rx=shape.circle?w:(Math.abs(c)*w+Math.abs(s)*shape.h)/2,ry=shape.circle?w:(Math.abs(s)*w+Math.abs(c)*shape.h)/2,pad=4;out.push({body:shape.name,left:X(x-rx)-pad-(shape.name==='torso'&&['hiker','explorer'].includes(skin)?scale*.16:0),right:X(x+rx)+pad,top:Y(y+ry)-pad,bottom:Y(y-ry)+pad});}}
 return out;
}
export function robotScreenBounds(frame,parts,X,Y){const boxes=robotPartBounds(frame,parts,X,Y);return boxes.length?{left:Math.min(...boxes.map(b=>b.left)),right:Math.max(...boxes.map(b=>b.right)),top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom))}:null;}
const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
export function rewardPopupLayout(frame,X,Y,layout={},measure=text=>text.length*7){
 const occupied=[],silhouette=robotPartBounds(frame,layout.parts,X,Y,layout.skin),out=[],W=layout.width??Infinity,H=layout.height??Infinity;
 for(const e of rewardPopups(frame)){const text=rewardText(e.value),width=measure(text)+5,sx=X(e.point[0]),sy=Y(e.point[1])-e.rise*.45,nearest=silhouette.find(b=>b.body===e.body)||[...silhouette].sort((a,b)=>Math.hypot((a.left+a.right)/2-sx,(a.top+a.bottom)/2-sy)-Math.hypot((b.left+b.right)/2-sx,(b.top+b.bottom)/2-sy))[0],b=nearest||{left:sx-8,right:sx+8,top:sy-8,bottom:sy+8},candidates=[];
  for(const dy of [0,-14,14,-28,28,-42,42])candidates.push([b.left-width/2-3,sy+dy],[b.right+width/2+3,sy+dy]);for(const dx of [0,-14,14,-28,28])candidates.push([sx+dx,b.top-11-e.rise*.3],[sx+dx,b.bottom+11]);
  candidates.sort((a,b)=>Math.hypot(a[0]-sx,a[1]-sy)-Math.hypot(b[0]-sx,b[1]-sy));
  for(const [x,y]of candidates){const box={left:x-width/2,right:x+width/2,top:y-7,bottom:y+7};if(box.left<2||box.right>W-2||box.top<2||box.bottom>H-2||silhouette.some(b=>intersects(box,b))||occupied.some(b=>intersects(box,b)))continue;occupied.push(box);out.push({...e,text,x,y,box});break;}
 }
 return out;
}
export function rewardTotals(metrics){let positive=0,negative=0;for(const n of Object.values(metrics?.rewardTerms||{})){if(!Number.isFinite(n))continue;if(n>=0)positive+=n;else negative-=n;}const sum=positive+negative;return {positive,negative,positiveRatio:sum?positive/sum:0,negativeRatio:sum?negative/sum:0};}
export function drawRewardPopups(ctx,frame,X,Y,layout={}){
 ctx.save();ctx.font='600 11px "Noto Sans KR", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
 for(const e of rewardPopupLayout(frame,X,Y,layout,text=>ctx.measureText(text).width)){ctx.globalAlpha=e.opacity;ctx.lineWidth=2.5;ctx.strokeStyle='#ffffffdf';ctx.strokeText(e.text,e.x,e.y);ctx.fillStyle=e.value>0?'#2e8b57':'#cb4850';ctx.fillText(e.text,e.x,e.y);}
 ctx.restore();
}
