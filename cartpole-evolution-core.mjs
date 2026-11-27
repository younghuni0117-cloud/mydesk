// Cart-Pole Evolution Lab: lightweight fixed-step cart + coupled-link dynamics.
export const DT = 1/60, GRAVITY = 9.81, X_LIMIT = 2.4, LEVELS = [1,2,3,4,5];
export function linkCount(level){ return Math.max(1,Math.min(5,Number(level)||1)); }
export function resetState(level, rng=Math.random){ const n=linkCount(level); return {x:0,v:0,angles:Array.from({length:n},()=>Math.PI+(rng()-.5)*.12),omegas:Array(n).fill(0),time:0}; }
export function obs(s){ return [s.x/X_LIMIT,s.v/5,...s.angles.map(a=>Math.sin(a)),...s.angles.map(a=>Math.cos(a)),...s.omegas.map(w=>Math.tanh(w/8))]; }
export function step(s,action,level,dt=DT){ const n=linkCount(level), u=Math.max(-1,Math.min(1,action)), force=14*u; const a=force-0.18*s.v; const next={x:s.x+dt*s.v,v:s.v+dt*a,angles:[],omegas:[],time:s.time+dt}; for(let i=0;i<n;i++){ const drive=(i===0?a:0.35*a/(i+1)); const q=s.angles[i], w=s.omegas[i]; const alpha=(GRAVITY*Math.sin(q)-drive*Math.cos(q)-0.045*w)/(0.45+0.12*i); next.angles.push(q+dt*w); next.omegas.push(w+dt*alpha); } return next; }
export function reward(s,action,level){ const n=linkCount(level), upright=s.angles.reduce((z,a)=>z+(1+Math.cos(a))/2,0)/n; const vel=s.omegas.reduce((z,w)=>z+Math.min(1,(w/8)**2),0)/n; return upright-0.08*vel-0.012*action*action-0.03*(s.x/X_LIMIT)**2; }
export function terminal(s,seconds){ return Math.abs(s.x)>X_LIMIT || s.time>=seconds || !Number.isFinite(s.x)||s.angles.some(a=>!Number.isFinite(a)); }
export function success(s){ return s.angles.every(a=>Math.abs(Math.atan2(Math.sin(a),Math.cos(a)))<Math.PI/18) && Math.abs(s.x)<1.8; }
