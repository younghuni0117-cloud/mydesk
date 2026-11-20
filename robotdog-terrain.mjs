// Named terrain shape, rocks and rendering share these deterministic SI-unit functions.
export const TERRAINS={flat:'초원 평지',hills:'완만한 언덕',rough:'잔돌 초원',uphill:'오르막',downhill:'내리막',steps:'낮은 계단',ridge:'능선 길'};
export const terrainKind=value=>Object.hasOwn(TERRAINS,value)?value:'flat';
export function baseSurface(kind,x,z){let h=0,dx=0,dz=0;
 if(kind==='hills'){const a=.65*x,b=.35*x+.6*z;h=.28*Math.sin(a)+.08*Math.sin(b);dx=.182*Math.cos(a)+.028*Math.cos(b);dz=.048*Math.cos(b);}
 else if(kind==='rough'){const a=3.4*x+1.1*z,b=2.7*z-.7*x,c=5*x-3*z;h=.035*Math.sin(a)*Math.sin(b)+.015*Math.sin(c);dx=.035*(3.4*Math.cos(a)*Math.sin(b)-.7*Math.sin(a)*Math.cos(b))+.075*Math.cos(c);dz=.035*(1.1*Math.cos(a)*Math.sin(b)+2.7*Math.sin(a)*Math.cos(b))-.045*Math.cos(c);}
 else if(kind==='uphill'||kind==='downhill'){dx=(kind==='uphill'?1:-1)*.23;h=dx*x;}
 else if(kind==='steps'){const t=(x+.225)/.45,n=Math.floor(t),u=t-n,s=Math.max(0,Math.min(1,(u-.80)/.20));h=.075*(n+s*s*(3-2*s));dx=s>0&&s<1?.075*6*s*(1-s)/(.45*.20):0;}
 else if(kind==='ridge'){h=.19*Math.sin(x*.8)+.30*Math.exp(-z*z*1.4);dx=.152*Math.cos(x*.8);dz=-.84*z*Math.exp(-z*z*1.4);}
 return {height:h,dx,dz};
}
const rockCache=new Map();
const hash=(x,z,seed=0)=>{let h=Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^Math.imul(seed+1,1274126177);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
export function rockCell(kind,cx,cz){const key=kind+':'+cx+','+cz;if(rockCache.has(key))return rockCache.get(key);const rough=kind==='rough',step=rough?.7:1.4,probability=rough?.82:kind==='flat'?.24:kind==='hills'?.12:kind==='steps'?0:.10;
 let rock=null;if(hash(cx,cz,1)<probability){const x=(cx+.5+(hash(cx,cz,2)-.5)*.4)*step,z=(cz+.5+(hash(cx,cz,3)-.5)*.4)*step,rx=(rough?.09:.055)+hash(cx,cz,4)*(rough?.10:.065),rz=(rough?.08:.05)+hash(cx,cz,5)*(rough?.11:.06),height=(rough?.035:.012)+hash(cx,cz,6)*(rough?.075:.025);rock={x,z,rx,rz,height,shade:hash(cx,cz,7),step};}
 if(rockCache.size>3000)rockCache.clear();rockCache.set(key,rock);return rock;
}
export function terrainRocks(kind,cx,cz,width=12,depth=10){const step=kind==='rough'?.7:1.4,result=[];for(let x=Math.floor((cx-width/2)/step);x<=Math.ceil((cx+width/2)/step);x++)for(let z=Math.floor((cz-depth/2)/step);z<=Math.ceil((cz+depth/2)/step);z++){const r=rockCell(kind,x,z);if(r&&Math.abs(r.x-cx)<width/2&&Math.abs(r.z-cz)<depth/2)result.push(r);}return result;}
export function surface(kind,x,z){const base=baseSurface(kind,x,z),step=kind==='rough'?.7:1.4,r=rockCell(kind,Math.floor(x/step),Math.floor(z/step));let h=base.height,dx=base.dx,dz=base.dz;
 if(r){const a=(x-r.x)/r.rx,b=(z-r.z)/r.rz,t=1-a*a-b*b;if(t>0){h+=r.height*t*t;dx-=4*r.height*t*a/r.rx;dz-=4*r.height*t*b/r.rz;}}
 const n=Math.hypot(dx,1,dz);return{height:h,dx,dz,normal:[-dx/n,1/n,-dz/n],friction:kind==='rough'?.95:kind==='steps'?.9:.85};
}
export const terrainStyle=kind=>({flat:{ground:'#819d59',soil:'#b6a07c',grass:1050},hills:{ground:'#769855',soil:'#b7a17c',grass:1200},rough:{ground:'#9b987b',soil:'#8f8e7d',grass:320},uphill:{ground:'#829d60',soil:'#b79973',grass:850},downhill:{ground:'#73905a',soil:'#ad9672',grass:850},steps:{ground:'#a9aba3',soil:'#8d8a80',grass:260},ridge:{ground:'#839764',soil:'#c2ad89',grass:650}}[terrainKind(kind)]);
