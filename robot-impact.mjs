// Impulses are applied by physics exactly once. These functions only draw the event.
export const PUSH_PARTS=Object.freeze(['head','torso','pelvis','leftUpperArm','rightUpperArm','leftForearm','rightForearm','leftHand','rightHand','leftThigh','rightThigh','leftShin','rightShin','leftFoot','rightFoot','leftToePart','rightToePart']);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function hammerMotion(strength,elapsed){const power=clamp(strength/30),windup=.25+.2*power,finish=.45+.15*power;if(elapsed< -windup||elapsed>finish)return null;const before=elapsed<0,progress=before?clamp((elapsed+windup)/windup):clamp(elapsed/finish);return {power,windup,finish,opacity:before?clamp(progress*4):clamp((1-progress)*3),distance:before?(1-progress*progress)*(.45+.45*power):progress*(.2+.2*power),swing:before?(1-progress)*(.7+.8*power):-progress*.4,size:.7+.65*power,impact:!before&&elapsed<.17};}
export function hammerEffects(frame,meta){
 const hits=frame.hits||[],effects=[],seen=new Set(),time=frame.time??frame.metrics?.time??0;
 for(const plan of meta.pushPlan||[]){if(meta.metrics&&plan.time>meta.metrics.time)continue;const hit=hits.find(h=>Math.abs((h.scheduledTime??h.time)-plan.time)<.025&&h.requestedLocation===plan.location);const at=hit?.time??plan.time,motion=hammerMotion(plan.strength,time-at);if(!motion||(!hit&&time>=plan.time))continue;
 const index=meta.parts.findIndex(p=>p.name===(plan.location==='shoulder'?'torso':plan.location));const pose=frame.parts[index<0?meta.parts.findIndex(p=>p.name==='torso'):index];if(!pose)continue;effects.push({...plan,...hit,...motion,point:hit?.point||pose.slice(0,2)});if(hit)seen.add(hit.id);}
 for(const hit of hits){if(seen.has(hit.id))continue;const motion=hammerMotion(hit.strength,time-hit.time);if(motion)effects.push({...hit,...motion});}return effects;
}
export function drawHammer(ctx,effect,X,Y,scale){
 const e=effect,angle=e.direction*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle),x=e.point[0]-dx*e.distance,y=e.point[1]-dy*e.distance,unit=Math.max(18,Math.min(70,scale*.34))*e.size;
 ctx.save();ctx.globalAlpha=e.opacity;ctx.translate(X(x),Y(y));ctx.rotate(-angle+e.swing);ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=2;ctx.strokeStyle='#344454';
 ctx.fillStyle='#a57649';ctx.beginPath();ctx.roundRect(-unit*.65,-unit*.07,unit*.7,unit*.14,3);ctx.fill();ctx.stroke();ctx.fillStyle='#d7a563';ctx.fillRect(-unit*.57,-unit*.065,unit*.12,unit*.13);
 ctx.fillStyle='#abbcc7';ctx.beginPath();ctx.roundRect(-unit*.04,-unit*.32,unit*.27,unit*.64,3);ctx.fill();ctx.stroke();ctx.fillStyle='#e4eef3';ctx.fillRect(-unit*.015,-unit*.26,unit*.07,unit*.5);ctx.restore();
 if(e.impact){ctx.save();ctx.globalAlpha=e.opacity;ctx.strokeStyle='#e3a14b';ctx.lineWidth=2+e.power*2;const cx=X(e.point[0]),cy=Y(e.point[1]),count=5+Math.round(e.power*6);for(let i=0;i<count;i++){const a=i/count*Math.PI*2,r=unit*(.25+.3*e.power);ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r*.5,cy+Math.sin(a)*r*.5);ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.stroke();}ctx.restore();}
}
