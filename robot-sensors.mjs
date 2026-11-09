import {terrainHeight,rockVertices} from './robot-terrain.mjs?v=robot46';
export const TERRAIN_SENSOR_COUNT=26;
const clamp=(v,a=-1,b=1)=>Math.max(a,Math.min(b,v));
// Geometry measurements only: this module never issues a motor command.
export function sensedSurface(terrain,obstacles,x,side){
 let height=terrainHeight(terrain.segments,x);
 for(const o of obstacles){if(o.shape==='stalactite'||(o.side&&o.side!=='both'&&o.side!==side))continue;const dx=x-o.x;if(Math.abs(dx)>(o.shape==='pipe'?o.height/2:o.width/2))continue;const bottom=o.bottom??terrainHeight(terrain.segments,o.x);
 if(o.shape==='pipe'){const r=o.height/2;if(Math.abs(dx)<=r)height=Math.max(height,bottom+r+Math.sqrt(Math.max(0,r*r-dx*dx)));continue;}
 if(Math.abs(dx)>o.width/2)continue;
 if(o.shape==='rock'){const vertices=rockVertices(o);for(let i=0;i<vertices.length;i++){const [a,b]=[vertices[i],vertices[(i+1)%vertices.length]];if(dx<Math.min(a[0],b[0])||dx>Math.max(a[0],b[0]))continue;const y=Math.abs(b[0]-a[0])<1e-9?Math.max(a[1],b[1]):a[1]+(b[1]-a[1])*(dx-a[0])/(b[0]-a[0]);height=Math.max(height,bottom+o.height/2+y);}}else height=Math.max(height,bottom+o.height);
 }return height;
}
export const VISION_VERSION=3;
export const VISION_RANGE=3.2;
export const VISION_ANGLES=Object.freeze(Array.from({length:17},(_,i)=>(-92+i*177/16)*Math.PI/180));
export function eyeOrigin(head){const angle=head.angle??0,c=Math.cos(angle),s=Math.sin(angle);return {x:head.x+c*.065-s*.025,y:head.y+s*.065+c*.025,angle};}
const cross=(ax,ay,bx,by)=>ax*by-ay*bx;
function lineHit(origin,dx,dy,a,b,limit){const ex=b[0]-a[0],ey=b[1]-a[1],den=cross(dx,dy,ex,ey);if(Math.abs(den)<1e-10)return null;const ax=a[0]-origin.x,ay=a[1]-origin.y,t=cross(ax,ay,ex,ey)/den,u=cross(ax,ay,dx,dy)/den;return t>=.005&&t<=limit&&u>=-1e-8&&u<=1+1e-8?t:null;}
function nearbyLines(segments,eye){const lines=[];for(let i=0;i<segments.length;i++){const s=segments[i];if(s.x1<eye.x-VISION_RANGE||s.x0>eye.x+VISION_RANGE)continue;lines.push([[s.x0,s.y0],[s.x1,s.y1]]);const previous=segments[i-1];if(previous&&Math.abs(previous.y1-s.y0)>1e-7)lines.push([[s.x0,previous.y1],[s.x0,s.y0]]);}return lines;}
export function sampleEnvironment(terrain,obstacles,pelvis,feet,head,direction=1){
 direction=direction<0?-1:1;const eye=eyeOrigin(head),datum=terrainHeight(terrain.segments,pelvis.x),floor=nearbyLines(terrain.segments,eye),roof=nearbyLines(terrain.ceilings||[],eye),objects=obstacles.filter(o=>Math.abs(o.x-eye.x)<=VISION_RANGE+o.width/2).map(o=>{const bottom=o.bottom??terrainHeight(terrain.segments,o.x),cy=bottom+o.height/2,vertices=o.shape==='pipe'?null:['rock','stalactite'].includes(o.shape)?rockVertices(o):[[-o.width/2,-o.height/2],[o.width/2,-o.height/2],[o.width/2,o.height/2],[-o.width/2,o.height/2]];return {o,cy,vertices:vertices?.map(p=>[o.x+p[0],cy+p[1]])};});
 function ray(angle,side,range=VISION_RANGE){const dx=Math.cos(angle),dy=Math.sin(angle);let distance=range,kind=null,object=null;const take=(t,type,o=null)=>{if(t!==null&&t<=distance){distance=t;kind=type;object=o;}};
 for(const [a,b] of floor)take(lineHit(eye,dx,dy,a,b,distance),'ground');for(const [a,b] of roof)take(lineHit(eye,dx,dy,a,b,distance),'ceiling');
 for(const item of objects){const {o,cy,vertices}=item;if(o.side&&o.side!=='both'&&o.side!==side)continue;if(!vertices){const fx=eye.x-o.x,fy=eye.y-cy,b=fx*dx+fy*dy,c=fx*fx+fy*fy-(o.height/2)**2,disc=b*b-c;if(disc>=0){const t=-b-Math.sqrt(disc);if(t>=.005)take(t<=distance?t:null,'obstacle',o);}}else for(let i=0;i<vertices.length;i++)take(lineHit(eye,dx,dy,vertices[i],vertices[(i+1)%vertices.length],distance),'obstacle',o);}
 return {x:eye.x+dx*distance,y:eye.y+dy*distance,distance,hit:kind!==null,kind,object,side};}
 function visible(x,y,side){const dx=x-eye.x,dy=y-eye.y,distance=Math.hypot(dx,dy),angle=Math.atan2(dy,dx),relative=Math.atan2(Math.sin(angle-eye.angle),Math.cos(angle-eye.angle));if(distance>VISION_RANGE||relative< -95*Math.PI/180||relative>85*Math.PI/180)return false;return ray(angle,side,Math.min(VISION_RANGE,distance+.04)).distance>=distance-.04;}
 const values=[],samples=[],scans={};for(const side of ['left','right']){scans[side]=VISION_ANGLES.map(angle=>ray(eye.angle+angle,side));for(let i=0;i<14;i+=2)values.push(Math.min(scans[side][i].distance,scans[side][i+1].distance)/VISION_RANGE);samples.push(...scans[side]);}
 for(const side of ['left','right']){const foot=feet[side],floorY=sensedSurface(terrain,obstacles,foot.x,side);values.push(visible(foot.x,floorY,side)?clamp((foot.y-floorY)/1.2):-1);}
 const nearest=['left','right'].map(side=>scans[side].filter(s=>s.object).map(s=>({distance:Math.max(0,Math.abs(s.object.x-feet[side].x)-(s.object.shape==='pipe'?s.object.height:s.object.width)/2),height:(s.object.bottom??terrainHeight(terrain.segments,s.object.x))+s.object.height-datum})).sort((a,b)=>a.distance-b.distance)[0]);
 values.push(...nearest.map(o=>o?clamp(o.distance/2.4,0,1):1),...nearest.map(o=>o?clamp(o.height/2):0));
 for(let i=14;i<17;i++)values.push(Math.min(scans.left[i].distance,scans.right[i].distance)/VISION_RANGE);
 for(const side of ['left','right']){const x=feet[side].x,a=terrainHeight(terrain.segments,x-.2),b=terrainHeight(terrain.segments,x+.2);values.push(visible(x-.2,a,side)&&visible(x+.2,b,side)?clamp((b-a)/.8):-1);}
 values.push(direction);return {values,samples,eye,coverage:terrainCoverage(samples,pelvis,direction,!!terrain.ceilings?.length)};
}

// Reward only measured, occlusion-aware terrain coverage; no target neck angle or motor command.
export function terrainCoverage(samples,pelvis,direction=1,hasCeiling=false){
 const covered=new Set();let roof=false;
 for(const s of samples){if(!s.hit)continue;const ahead=(s.x-pelvis.x)*direction;
  if(ahead<-.15||ahead>2.4)continue;
  if(s.kind==='ceiling'||s.object?.shape==='stalactite'){roof=true;continue;}
  if(s.kind==='ground'||s.kind==='obstacle')covered.add(ahead<.4?0:ahead<1.2?1:2);
 }
 return (covered.size/3)*(hasCeiling?.85:1)+(hasCeiling&&roof?.15:0);
}
