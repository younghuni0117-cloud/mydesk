export const BAG_MASS_DEFAULT=5.07;
export const BAG_MASS_MIN=.5;
export const BAG_MASS_MAX=200;
export const BAG_HEIGHT=.96;
export const BAG_HOOK_OFFSET=BAG_HEIGHT*.7;
export const BAG_ROPE_LENGTH=2.03-BAG_HOOK_OFFSET;
export function normalizeBagMass(raw){const value=Number(raw);return Number.isFinite(value)&&value>=BAG_MASS_MIN&&value<=BAG_MASS_MAX?Math.round(value*100)/100:BAG_MASS_DEFAULT;}
export function bagAttachment(bag){const [x,y]=bag.position,offset=bag.height*.7;return [x-Math.sin(bag.angle)*offset,y+Math.cos(bag.angle)*offset];}
export function interpolateBag(a,b,t){if(!a||!b||a.glove!==b.glove)return a;if(a.glove&&Math.hypot(b.position[0]-a.position[0],b.position[1]-a.position[1])>1)return b;const angle=a.angle+Math.atan2(Math.sin(b.angle-a.angle),Math.cos(b.angle-a.angle))*t;return {...a,position:a.position.map((v,i)=>v+(b.position[i]-v)*t),angle,...(a.velocity&&b.velocity?{velocity:a.velocity.map((v,i)=>v+(b.velocity[i]-v)*t)}:{}),angularVelocity:(a.angularVelocity||0)+((b.angularVelocity||0)-(a.angularVelocity||0))*t};}
// The physical rope is a unilateral length constraint. The braid and slack
// shape are lightweight scenery derived from that constraint, not extra bodies.
export function bagRopePath(bag,time=0){const a=bag.anchor,b=bagAttachment(bag),dx=b[0]-a[0],dy=b[1]-a[1],distance=Math.hypot(dx,dy),length=bag.ropeLength??BAG_ROPE_LENGTH,slack=Math.max(0,length-distance),sag=Math.sqrt(Math.max(0,length*length-distance*distance))*.36,wave=Math.min(.055,slack*.15+Math.abs(bag.angularVelocity||0)*.005*Math.min(1,slack*5));return Array.from({length:33},(_,i)=>{const t=i/32,envelope=Math.sin(Math.PI*t),sway=Math.sin(t*Math.PI*3-time*7)*wave*envelope;return [a[0]+dx*t+sway,a[1]+dy*t-sag*envelope];});}
