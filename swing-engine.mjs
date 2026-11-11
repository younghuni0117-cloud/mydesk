export const DT=.04, STEPS=500;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export class SwingLearner {
 constructor(random=Math.random){this.random=random;this.reset();}
 reset(){this.q=new Map();this.episodes=0;this.history=[];this.resetEpisode();}
 resetEpisode(){this.theta=.07;this.omega=0;this.hip=0;this.hipV=0;this.knee=.5;this.kneeV=0;this.steps=0;this.total=0;this.peak=0;this.exploring=false;}
 state(){const bin=(v,a,b,n)=>Math.min(n-1,Math.floor((clamp(v,a,b)-a)/(b-a)*n));return [bin(this.theta,-1.5,1.5,15),bin(this.omega,-3,3,15),bin(this.hip,-.7,.7,3),bin(this.knee,0,1,3)].join(',');}
 values(s){if(!this.q.has(s))this.q.set(s,new Float64Array(9));return this.q.get(s);}
 choose(s,epsilon){this.exploring=this.random()<epsilon;if(this.exploring)return Math.floor(this.random()*9);const q=this.values(s),max=Math.max(...q),best=[];q.forEach((v,i)=>{if(v===max)best.push(i);});return best[Math.floor(this.random()*best.length)];}
 physics(action,objective){const ht=[-.65,0,.65][Math.floor(action/3)],kt=[0,.5,1][action%3];const oldH=this.hip,oldK=this.knee;
 for(let i=0;i<4;i++){const dt=DT/4,ha=clamp(30*(ht-this.hip)-7*this.hipV,-18,18),ka=clamp(24*(kt-this.knee)-6*this.kneeV,-16,16);this.hipV+=ha*dt;this.hip=clamp(this.hip+this.hipV*dt,-.75,.75);this.kneeV+=ka*dt;this.knee=clamp(this.knee+this.kneeV*dt,0,1);const length=2.25-.35*this.knee,lengthV=-.35*this.kneeV;const accel=-9.81/length*Math.sin(this.theta)-.055*this.omega-2*lengthV/length*this.omega-.19*ha;this.omega=clamp(this.omega+accel*dt,-5,5);this.theta+=this.omega*dt;if(Math.abs(this.theta)>1.5){this.theta=clamp(this.theta,-1.5,1.5);this.omega*=-.25;}}
 const height=2.2*(1-Math.cos(this.theta));this.peak=Math.max(this.peak,height);const effort=(this.hip-oldH)**2+(this.knee-oldK)**2;const stability=1-.5*(this.hip/.75)**2-.5*Math.min(1,effort/.015);return objective*height/2.2+(1-objective)*stability-.008*(Math.abs(this.hipV)+Math.abs(this.kneeV));}
 step(epsilon,objective,learn=true){const s=this.state(),a=this.choose(s,epsilon),r=this.physics(a,objective);this.total+=r;this.steps++;const done=this.steps>=STEPS;if(learn){const q=this.values(s),target=r+(done?0:.98*Math.max(...this.values(this.state())));q[a]+=.12*(target-q[a]);}if(done){const result={reward:this.total/STEPS,peak:this.peak};if(learn){this.episodes++;this.history.push(result);if(this.history.length>100)this.history.shift();}this.resetEpisode();return result;}return null;}
}
