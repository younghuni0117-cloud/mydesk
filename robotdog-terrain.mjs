// One lightweight height field is shared by collision, sensors and the rendered meadow.
export const TERRAINS={flat:'초원 평지',hills:'완만한 언덕',rough:'잔돌 초원',uphill:'오르막',downhill:'내리막',steps:'낮은 계단',ridge:'능선 길'};
export const terrainKind=value=>Object.hasOwn(TERRAINS,value)?value:'flat';
export function surface(kind,x,z){let h=0,dx=0,dz=0;
 if(kind==='hills'){const a=.65*x,b=.35*x+.6*z;h=.20*Math.sin(a)+.06*Math.sin(b);dx=.13*Math.cos(a)+.021*Math.cos(b);dz=.036*Math.cos(b);}
 else if(kind==='rough'){const a=3.4*x+1.1*z,b=2.7*z-.7*x,c=5*x-3*z;h=.045*Math.sin(a)*Math.sin(b)+.018*Math.sin(c);dx=.045*(3.4*Math.cos(a)*Math.sin(b)-.7*Math.sin(a)*Math.cos(b))+.09*Math.cos(c);dz=.045*(1.1*Math.cos(a)*Math.sin(b)+2.7*Math.sin(a)*Math.cos(b))-.054*Math.cos(c);}
 else if(kind==='uphill'||kind==='downhill'){dx=(kind==='uphill'?1:-1)*.18;h=dx*x;}
 else if(kind==='steps'){const t=(x+.225)/.45,n=Math.floor(t),u=t-n,s=Math.max(0,Math.min(1,(u-.75)/.25));h=.065*(n+s*s*(3-2*s));dx=s>0&&s<1?.065*6*s*(1-s)/(.45*.25):0;}
 else if(kind==='ridge'){h=.13*Math.sin(x*.9)+.14*Math.exp(-z*z*2);dx=.117*Math.cos(x*.9);dz=-.56*z*Math.exp(-z*z*2);}
 const n=Math.hypot(dx,1,dz);return {height:h,dx,dz,normal:[-dx/n,1/n,-dz/n],friction:.85};
}
