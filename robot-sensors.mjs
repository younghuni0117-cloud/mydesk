import {terrainHeight,rockVertices} from './robot-terrain.mjs?v=robot34';
export const SENSOR_OFFSETS=Object.freeze([-.5,0,.25,.6,1,1.6,2.4]);
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
export function sampleEnvironment(terrain,obstacles,pelvis,feet,head,direction=1){
 direction=direction<0?-1:1;const datum=terrainHeight(terrain.segments,pelvis.x),values=[],samples=[];
 for(const side of ['left','right'])for(const offset of SENSOR_OFFSETS){const x=feet[side].x+offset*direction,y=sensedSurface(terrain,obstacles,x,side);values.push(clamp((y-datum)/2));samples.push({x,y,side});}
 for(const side of ['left','right'])values.push(clamp((feet[side].y-sensedSurface(terrain,obstacles,feet[side].x,side))/1.2));
 const nearest=['left','right'].map(side=>{let closest=null;for(const o of obstacles){if(o.shape==='stalactite'||(o.side&&o.side!=='both'&&o.side!==side))continue;const distance=direction*(o.x-feet[side].x)-(o.shape==='pipe'?o.height:o.width)/2;if(distance<0||distance>2.4||closest&&distance>=closest.distance)continue;closest={distance,height:(o.bottom??terrainHeight(terrain.segments,o.x))+o.height-datum};}return closest;});
 values.push(...nearest.map(o=>o?o.distance/2.4:1),...nearest.map(o=>o?clamp(o.height/2):0));
 for(const offset of [-.4,.5,1.2]){const x=head.x+offset*direction;let gap=terrain.ceilings?.length?terrainHeight(terrain.ceilings,x)-head.y:3;for(const o of obstacles)if(o.shape==='stalactite'&&Math.abs(x-o.x)<=o.width/2)gap=Math.min(gap,(o.bottom??terrainHeight(terrain.segments,o.x))-head.y);values.push(clamp(gap/3));}
 for(const side of ['left','right']){const x=feet[side].x;values.push(clamp((terrainHeight(terrain.segments,x+.2)-terrainHeight(terrain.segments,x-.2))/.8));}
 values.push(direction);return {values,samples};
}
