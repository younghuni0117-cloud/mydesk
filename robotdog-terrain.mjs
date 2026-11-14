// Shared analytic height field: display and contact physics use the same surface.
export const TERRAINS={flat:'평지',hills:'언덕',rough:'울퉁불퉁한 지형'};
export const terrainKind=value=>Object.hasOwn(TERRAINS,value)?value:'flat';
export function surface(kind,x,z){let h=0,dx=0,dz=0;if(kind==='hills'){const a=.65*x,b=.35*x+.6*z;h=.24*Math.sin(a)+.07*Math.sin(b);dx=.156*Math.cos(a)+.0245*Math.cos(b);dz=.042*Math.cos(b);}else if(kind==='rough'){const a=3.4*x+1.1*z,b=2.7*z-.7*x,c=5*x-3*z;h=.065*Math.sin(a)*Math.sin(b)+.025*Math.sin(c);dx=.065*(3.4*Math.cos(a)*Math.sin(b)-.7*Math.sin(a)*Math.cos(b))+.125*Math.cos(c);dz=.065*(1.1*Math.cos(a)*Math.sin(b)+2.7*Math.sin(a)*Math.cos(b))-.075*Math.cos(c);}const n=Math.hypot(dx,1,dz);return {height:h,dx,dz,normal:[-dx/n,1/n,-dz/n]};}
