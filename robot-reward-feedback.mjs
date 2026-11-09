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
export function robotScreenBounds(frame,parts,X,Y){
 if(!parts?.length)return null;let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
 parts.forEach((part,i)=>{const p=frame.parts?.[i];if(!p)return;const c=Math.abs(Math.cos(p[2])),s=Math.abs(Math.sin(p[2])),rx=part.circle?part.w:(c*part.w+s*part.h)/2,ry=part.circle?part.w:(s*part.w+c*part.h)/2;left=Math.min(left,X(p[0]-rx));right=Math.max(right,X(p[0]+rx));top=Math.min(top,Y(p[1]+ry));bottom=Math.max(bottom,Y(p[1]-ry));});
 const padding=Math.max(10,Math.min(32,Math.abs(X(1)-X(0))*.2));return Number.isFinite(left)?{left:left-padding,right:right+padding,top:top-padding,bottom:bottom+padding}:null;
}
const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
export function rewardPopupLayout(frame,X,Y,layout={},measure=text=>text.length*7){
 const occupied=[],bounds=robotScreenBounds(frame,layout.parts,X,Y),out=[],W=layout.width??Infinity,H=layout.height??Infinity;
 for(const e of rewardPopups(frame)){const text=rewardText(e.value),width=measure(text)+7,sourceX=X(e.point[0]),sourceY=Y(e.point[1])-10-e.rise,preferred=e.value>0?-1:1;
  const left=bounds?bounds.left-width/2-6:sourceX-24,right=bounds?bounds.right+width/2+6:sourceX+24,centerX=Math.max(width/2+4,Math.min(W-width/2-4,sourceX));
  const candidates=[[preferred<0?left:right,sourceY],[preferred<0?right:left,sourceY],...(bounds?[[centerX,bounds.top-14-e.rise],[centerX,bounds.bottom+14]]:[])];let chosen=null;
  for(const [x,y0]of candidates){for(let i=0;i<17;i++){const offset=i===0?0:Math.ceil(i/2)*18*(i%2?-1:1),y=y0+offset,box={left:x-width/2,right:x+width/2,top:y-8,bottom:y+8};if(box.left<2||box.right>W-2||box.top<2||box.bottom>H-2||(bounds&&intersects(box,bounds))||occupied.some(b=>intersects(box,b)))continue;chosen={...e,text,x,y,box};break;}if(chosen)break;}
  if(chosen){occupied.push(chosen.box);out.push(chosen);}
 }
 return out;
}
export function drawRewardPopups(ctx,frame,X,Y,layout={}){
 ctx.save();ctx.font='600 11px "Noto Sans KR", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
 for(const e of rewardPopupLayout(frame,X,Y,layout,text=>ctx.measureText(text).width)){ctx.globalAlpha=e.opacity;ctx.lineWidth=2.5;ctx.strokeStyle='#ffffffdf';ctx.strokeText(e.text,e.x,e.y);ctx.fillStyle=e.value>0?'#2e8b57':'#cb4850';ctx.fillText(e.text,e.x,e.y);}
 ctx.restore();
}
