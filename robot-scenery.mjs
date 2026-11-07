import {terrainHeight,rockVertices,TERRAINS} from './robot-terrain.mjs?v=robot8';
let atlas=null;
export const terrainArtReady=typeof Image==='undefined'?Promise.resolve(false):new Promise(resolve=>{atlas=new Image();atlas.onload=()=>resolve(true);atlas.onerror=()=>resolve(false);atlas.src=new URL('./assets/terrain-atlas.webp',import.meta.url).href;});
const noise=i=>{let n=Math.imul(i+913,374761393);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
const palettes={meadow:['#7e9c59','#b6956e','#557c3e'],hills:['#81975a','#b89b73','#526d3d'],stones:['#a9a58a','#a78f73','#6c7259'],stairs:['#a9ad97','#959483','#68765d'],construction:['#b6a181','#a58a67','#736752'],rockyhills:['#a28f6d','#b19b7d','#675f50'],ice:['#bcdce4','#8fbccf','#688fa4']};
function paintTerrain(ctx,{W,H,scale,camera,ground,terrain,obstacles,X,Y}){
 const kind=terrain?.kind||'meadow',segments=terrain?.segments||[],colors=palettes[kind]||palettes.meadow;
 ctx.fillStyle='#edf2ed';ctx.fillRect(0,0,W,H);
 if(atlas?.complete&&atlas.naturalWidth){const index=Object.keys(TERRAINS).indexOf(kind),pw=atlas.naturalWidth/7,sw=pw-8,sh=Math.min(atlas.naturalHeight,sw*H/W),sy=Math.max(0,(atlas.naturalHeight-sh)*.36);ctx.drawImage(atlas,index*pw+4,sy,sw,sh,0,0,W,H);ctx.fillStyle='#f6f7ee80';ctx.fillRect(0,0,W,H);}
 const left=camera-W/scale/2-.3,right=camera+W/scale/2+.3,step=Math.max(.08,(right-left)/250),height=x=>terrainHeight(segments,x);
 const ridge=[[left,height(left)]];for(const s of segments){if(s.x0>left&&s.x0<right)ridge.push([s.x0,height(s.x0-1e-7)],[s.x0,s.y0]);if(s.x1>left&&s.x1<right)ridge.push([s.x1,s.y1],[s.x1,height(s.x1+1e-7)]);}ridge.push([right,height(right)]);
 function surface(){ctx.beginPath();ctx.moveTo(X(left),H+4);for(const [x,y]of ridge)ctx.lineTo(X(x),Y(y));ctx.lineTo(X(right),H+4);ctx.closePath();}
 surface();ctx.fillStyle=colors[0];ctx.fill();ctx.save();ctx.clip();ctx.fillStyle=colors[1];ctx.beginPath();ctx.moveTo(X(left),H+4);for(const [x,y]of ridge)ctx.lineTo(X(x),Y(y-.05));ctx.lineTo(X(right),H+4);ctx.closePath();ctx.fill();
 // Exposed soil strata and embedded fragments follow world coordinates.
 for(let row=0;row<5;row++){ctx.strokeStyle=row%2?'#e8d7b54d':'#6c61413d';ctx.lineWidth=1+row*.35;ctx.beginPath();for(let x=left;x<=right+step;x+=step){const y=Y(height(x)-.1-row*.13-.025*Math.sin(x*4+row));if(x===left)ctx.moveTo(X(x),y);else ctx.lineTo(X(x),y);}ctx.stroke();}
 const spacing=Math.max(.12,18/scale);
 for(let i=Math.floor(left/spacing);i<right/spacing;i++){const x=i*spacing,y=height(x),r=noise(i);ctx.fillStyle=kind==='ice'?'#e6f6f9a0':'#6d684358';ctx.beginPath();ctx.ellipse(X(x),Y(y-.14-r*.4),Math.max(1,scale*.018),Math.max(1,scale*.01),r*3,0,Math.PI*2);ctx.fill();}
 ctx.restore();ctx.strokeStyle=colors[2];ctx.lineWidth=Math.max(1.2,Math.min(3,scale*.012));ctx.beginPath();let first=true;for(const [x,y]of ridge){if(first){ctx.moveTo(X(x),Y(y));first=false;}else ctx.lineTo(X(x),Y(y));}ctx.stroke();
 // Small surface details never replace the physical collision boundary.
 const grass=['meadow','hills','rockyhills'].includes(kind),cell=Math.max(.18,14/scale);
 for(let i=Math.floor(left/cell);i<right/cell;i++){const x=i*cell,r=noise(i+73),y=height(x),px=X(x),py=Y(y);if(grass){ctx.strokeStyle=r>.7?'#6b7949':'#56713e';ctx.lineWidth=1;for(let j=0;j<3;j++){ctx.beginPath();ctx.moveTo(px+j*2-2,py+1);ctx.quadraticCurveTo(px+j*2-5,py-3,px+(j-1)*5,py-(3+r*7));ctx.stroke();}if(r>.87&&scale>55){ctx.fillStyle=r>.94?'#f3d596':'#ece2c0';ctx.beginPath();ctx.arc(px,py-6,2,0,Math.PI*2);ctx.fill();}}
  else if(kind==='ice'){ctx.strokeStyle='#f4fdffaa';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px-7,py+3);ctx.lineTo(px+3,py+10);ctx.lineTo(px-1,py+17);ctx.stroke();}
  else if(kind==='stairs'){ctx.strokeStyle='#64705b';ctx.beginPath();ctx.moveTo(px,py+2);ctx.lineTo(px+3,py+10+r*10);ctx.stroke();}
 }
 for(const o of obstacles){if(o.x+o.width<left||o.x-o.width>right)continue;const base=height(o.x),cx=X(o.x),cy=Y(base+o.height/2),w=o.width*scale,h=o.height*scale;
  if(o.shape==='rock'){const points=rockVertices(o).map(([x,y])=>[X(o.x+x),Y(base+o.height/2+y)]);ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=kind==='rockyhills'?'#a38e73':'#929787';ctx.fill();ctx.strokeStyle='#4f5d57';ctx.lineWidth=1;ctx.stroke();ctx.beginPath();ctx.moveTo(...points[0]);ctx.lineTo(cx,cy-h*.16);ctx.lineTo(...points[3]);ctx.strokeStyle='#d6ccb0';ctx.stroke();ctx.beginPath();ctx.moveTo(cx,cy-h*.16);ctx.lineTo(...points[1]);ctx.strokeStyle='#5c695e';ctx.stroke();}
  else{ctx.fillStyle='#9c9277';ctx.fillRect(cx-w/2,cy-h/2,w,h);ctx.strokeStyle='#646b5b';ctx.lineWidth=1;ctx.strokeRect(cx-w/2,cy-h/2,w,h);ctx.fillStyle='#d6bb73';for(let a=-w/2;a<w/2;a+=9)ctx.fillRect(cx+a,cy-h/2,4,Math.min(h,4));}
  if(o.side!=='both'){ctx.fillStyle=o.side==='left'?'#d79a5c':'#6b99b9';ctx.beginPath();ctx.arc(cx,cy,Math.max(1,Math.min(2.8,w*.12)),0,Math.PI*2);ctx.fill();}
 }
 // A sparse world ruler stays readable while zoomed out.
 const grid=Math.max(1,Math.ceil(70/scale));ctx.fillStyle='#f8f9efcc';ctx.fillRect(0,H-17,W,17);ctx.fillStyle='#667969';ctx.font='9px sans-serif';ctx.textAlign='center';for(let x=Math.floor(left/grid)*grid;x<right;x+=grid)ctx.fillText(`${x}m`,X(x),H-5);
}

let cached=null,cacheKey='',lastTerrain=null,lastObstacles=null;
export function drawTerrainScene(ctx,args){
 const key=[args.W,args.H,args.scale,args.camera,args.ground,Boolean(atlas?.complete&&atlas.naturalWidth)].join(':');
 if(!cached)cached=document.createElement('canvas');
 if(key!==cacheKey||lastTerrain!==args.terrain||lastObstacles!==args.obstacles){cached.width=Math.max(1,Math.ceil(args.W));cached.height=Math.max(1,Math.ceil(args.H));paintTerrain(cached.getContext('2d'),args);cacheKey=key;lastTerrain=args.terrain;lastObstacles=args.obstacles;}
 ctx.drawImage(cached,0,0,args.W,args.H);
}
