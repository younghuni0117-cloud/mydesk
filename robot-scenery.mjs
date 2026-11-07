import {terrainHeight,rockVertices,TERRAINS} from './robot-terrain.mjs?v=robot10';
let atlas=null,caveAtlas=null;
function loadArt(file,set){return new Promise(resolve=>{const image=new Image();set(image);image.onload=()=>resolve(true);image.onerror=()=>resolve(false);image.src=new URL(file,import.meta.url).href;});}
export const terrainArtReady=typeof Image==='undefined'?Promise.resolve(false):Promise.all([loadArt('./assets/terrain-atlas.webp',i=>atlas=i),loadArt('./assets/terrain-atlas-v9.webp',i=>caveAtlas=i)]).then(r=>r.every(Boolean));
const noise=i=>{let n=Math.imul(i+913,374761393);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
const palettes={meadow:['#7e9c59','#b6956e','#557c3e'],hills:['#81975a','#b89b73','#526d3d'],stones:['#a9a58a','#a78f73','#6c7259'],stairs:['#a9ad97','#959483','#68765d'],construction:['#b6a181','#a58a67','#736752'],rockyhills:['#a28f6d','#b19b7d','#675f50'],ice:['#bcdce4','#8fbccf','#688fa4'],cave:['#66616b','#393b46','#212a35']};
function paintTerrain(ctx,{W,H,scale,camera,ground,terrain,obstacles,X,Y}){
 const kind=terrain?.kind||'meadow',segments=terrain?.segments||[],colors=palettes[kind]||palettes.meadow;
 ctx.fillStyle='#edf2ed';ctx.fillRect(0,0,W,H);
 const image=kind==='cave'?caveAtlas:atlas;
 if(image?.complete&&image.naturalWidth){let sx,sy,sw,sh;const aspect=W/H;if(kind==='cave'){const pw=image.naturalWidth/2,ph=image.naturalHeight/4;sw=pw-6;sh=ph-6;if(sw/sh>aspect)sw=sh*aspect;else sh=sw/aspect;sx=pw+(pw-sw)/2;sy=3*ph+(ph-sh)/2;}else{const index=Object.keys(TERRAINS).indexOf(kind),pw=image.naturalWidth/7;sw=pw-8;sh=Math.min(image.naturalHeight,sw/aspect);sx=index*pw+4;sy=(image.naturalHeight-sh)*.36;}ctx.save();ctx.globalAlpha=.64;ctx.drawImage(image,sx,sy,sw,sh,0,0,W,H);ctx.restore();}

 const left=camera-W/scale/2-.3,right=camera+W/scale/2+.3,step=Math.max(.08,(right-left)/250),height=x=>terrainHeight(segments,x);
 const ridge=[[left,height(left)]];for(const s of segments){if(s.x0>left&&s.x0<right)ridge.push([s.x0,height(s.x0-1e-7)],[s.x0,s.y0]);if(s.x1>left&&s.x1<right)ridge.push([s.x1,s.y1],[s.x1,height(s.x1+1e-7)]);}ridge.push([right,height(right)]);
 function surface(){ctx.beginPath();ctx.moveTo(X(left),H+4);for(const [x,y]of ridge)ctx.lineTo(X(x),Y(y));ctx.lineTo(X(right),H+4);ctx.closePath();}
 surface();ctx.fillStyle=colors[0];ctx.fill();ctx.save();ctx.clip();ctx.fillStyle=colors[1];ctx.beginPath();ctx.moveTo(X(left),H+4);for(const [x,y]of ridge)ctx.lineTo(X(x),Y(y-.05));ctx.lineTo(X(right),H+4);ctx.closePath();ctx.fill();
 // Exposed soil strata and embedded fragments follow world coordinates.
 for(let row=0;row<5;row++){ctx.strokeStyle=row%2?'#e8d7b54d':'#6c61413d';ctx.lineWidth=1+row*.35;ctx.beginPath();for(let x=left;x<=right+step;x+=step){const y=Y(height(x)-.1-row*.13-.025*Math.sin(x*4+row));if(x===left)ctx.moveTo(X(x),y);else ctx.lineTo(X(x),y);}ctx.stroke();}
 const spacing=Math.max(.12,18/scale);
 for(let i=Math.floor(left/spacing);i<right/spacing;i++){const x=i*spacing,y=height(x),r=noise(i);ctx.fillStyle=kind==='ice'?'#e6f6f9a0':'#6d684358';ctx.beginPath();ctx.ellipse(X(x),Y(y-.14-r*.4),Math.max(1,scale*.018),Math.max(1,scale*.01),r*3,0,Math.PI*2);ctx.fill();}
 ctx.restore();ctx.strokeStyle=colors[2];ctx.lineWidth=Math.max(1.2,Math.min(3,scale*.012));ctx.beginPath();let first=true;for(const [x,y]of ridge){if(first){ctx.moveTo(X(x),Y(y));first=false;}else ctx.lineTo(X(x),Y(y));}ctx.stroke();
 // Irregular world-space vegetation and rubble; each cluster has its own size and shape.
 for(const d of terrain?.decorations||[]){if(d.x<left-.5||d.x>right+.5)continue;const px=X(d.x),py=Y(height(d.x)),size=Math.max(2,Math.min(80,d.size*scale)),v=d.variant;ctx.lineWidth=1;
  if(['frost','lichen','gravel','crystal'].includes(d.type)){ctx.strokeStyle=d.type==='frost'?'#edfaff':d.type==='crystal'?'#9e9bc6':'#899078';ctx.lineWidth=1;ctx.beginPath();if(d.type==='crystal'){ctx.moveTo(px-size*.2,py);ctx.lineTo(px,py-size);ctx.lineTo(px+size*.25,py);ctx.closePath();ctx.fillStyle='#8e93b4';ctx.fill();}else{ctx.moveTo(px-size*.4,py+2);ctx.lineTo(px,py+size*.3);ctx.lineTo(px+size*.5,py+1);}ctx.stroke();}
  else if(d.type==='bush'){ctx.fillStyle=kind==='cave'?'#456f67':kind==='ice'?'#8cadb5':'#426d35';ctx.strokeStyle=kind==='cave'?'#213d40':'#2e5031';for(let j=0;j<5;j++){ctx.beginPath();ctx.ellipse(px+(j-2)*size*.19,py-size*(.2+noise(j+Math.floor(d.x*71))*.22),size*.26,size*(.23+v*.19),j*.6,0,Math.PI*2);ctx.fill();ctx.stroke();}ctx.strokeStyle='#abc568';ctx.beginPath();ctx.moveTo(px-size*.4,py-size*.22);ctx.lineTo(px+size*.2,py-size*.43);ctx.stroke();}
  else if(d.type==='pebbles'){for(let j=0;j<3+Math.floor(v*5);j++){const a=px+(noise(j+Math.floor(d.x*43))-.5)*size*1.8,b=py+noise(j+51)*3;ctx.fillStyle=kind==='cave'?'#6c7391':j%2?'#b2ab92':'#7c8575';ctx.strokeStyle='#505e58';ctx.beginPath();ctx.ellipse(a,b-size*.12,Math.max(1,size*.2),Math.max(1,size*.12),v*3,0,Math.PI*2);ctx.fill();ctx.stroke();}}
  else if(d.type==='stump'){ctx.fillStyle='#79654d';ctx.strokeStyle='#493f35';ctx.beginPath();ctx.moveTo(px-size*.25,py);ctx.lineTo(px-size*.18,py-size*.8);ctx.lineTo(px+size*.25,py-size*.68);ctx.lineTo(px+size*.35,py);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#b29c70';ctx.beginPath();ctx.moveTo(px,py-2);ctx.lineTo(px-size*.03,py-size*.65);ctx.stroke();}
  else{const leaves=d.type==='fern'?7:3+Math.floor(v*4);ctx.strokeStyle=kind==='cave'?'#559c87':kind==='ice'?'#c7e6df':'#497534';for(let j=0;j<leaves;j++){const dx=(j-(leaves-1)/2)*size*.25;ctx.beginPath();ctx.moveTo(px,py);ctx.quadraticCurveTo(px+dx*.3,py-size*.35,px+dx,py-size*(.35+noise(j+Math.floor(d.x*23))*.55));ctx.stroke();if(d.type==='flowers'||kind==='cave'){ctx.fillStyle=kind==='cave'?'#65c4b2':v>.5?'#f2c15e':'#e7e0d4';ctx.beginPath();ctx.arc(px+dx,py-size*.65,Math.max(1,size*.08),0,Math.PI*2);ctx.fill();}}}
 }
 for(const o of obstacles){if(o.x+o.width<left||o.x-o.width>right)continue;const base=o.bottom??height(o.x),cx=X(o.x),cy=Y(base+o.height/2),w=o.width*scale,h=o.height*scale;
  if(o.shape==='rock'||o.shape==='stalactite'){const points=rockVertices(o).map(([x,y])=>[X(o.x+x),Y(base+o.height/2+y)]);ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=o.material==='crystal'?'#6176a1':o.material==='ice'?'#84bfda':kind==='cave'?'#696476':kind==='rockyhills'?'#a38e73':'#929787';ctx.fill();ctx.strokeStyle='#4f5d57';ctx.lineWidth=1;ctx.stroke();ctx.beginPath();ctx.moveTo(...points[0]);ctx.lineTo(cx,cy-h*.16);ctx.lineTo(...points[Math.min(3,points.length-1)]);ctx.strokeStyle='#d6ccb0';ctx.stroke();ctx.beginPath();ctx.moveTo(cx,cy-h*.16);ctx.lineTo(...points[1]);ctx.strokeStyle='#5c695e';ctx.stroke();}
  else{ctx.fillStyle='#9c9277';ctx.fillRect(cx-w/2,cy-h/2,w,h);ctx.strokeStyle='#646b5b';ctx.lineWidth=1;ctx.strokeRect(cx-w/2,cy-h/2,w,h);ctx.fillStyle='#d6bb73';for(let a=-w/2;a<w/2;a+=9)ctx.fillRect(cx+a,cy-h/2,4,Math.min(h,4));}
  if(o.side!=='both'){ctx.fillStyle=o.side==='left'?'#d79a5c':'#6b99b9';ctx.beginPath();ctx.arc(cx,cy,Math.max(1,Math.min(2.8,w*.12)),0,Math.PI*2);ctx.fill();}
 }
 if(terrain?.ceilings?.length){const ceiling=x=>terrainHeight(terrain.ceilings,x);function roofPath(){ctx.beginPath();ctx.moveTo(X(left),0);ctx.lineTo(X(right),0);for(let x=right;x>=left;x-=step)ctx.lineTo(X(x),Y(ceiling(x)));ctx.closePath();}roofPath();ctx.fillStyle='#373843';ctx.fill();ctx.save();ctx.clip();
  const spacing=Math.max(.3,24/scale);for(let i=Math.floor(left/spacing)-1;i<right/spacing+1;i++){for(let row=0;row<6;row++){const x=i*spacing+(noise(i+row*113+333)-.5)*spacing,y=ceiling(x)+.2+row*.65+noise(i+row*13+94)*.65,px=X(x),py=Y(y),w=scale*(.4+noise(i+row*17+26)*1.1),h=scale*(.35+noise(i+row*19+16)*.6);ctx.fillStyle=['#414351','#4b4b5b','#555162','#333943'][i&3];ctx.strokeStyle='#252e3a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px-w*.5,py);ctx.lineTo(px-w*.3,py-h*.6);ctx.lineTo(px+w*.3,py-h*.4);ctx.lineTo(px+w*.55,py+h*.25);ctx.lineTo(px,py+h*.48);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#747184';ctx.beginPath();ctx.moveTo(px-w*.34,py-h*.3);ctx.lineTo(px+w*.26,py-h*.17);ctx.stroke();}}
  ctx.restore();ctx.strokeStyle='#1b2633';ctx.lineWidth=2;ctx.beginPath();let first=true;for(let x=left;x<=right;x+=step){if(first){ctx.moveTo(X(x),Y(ceiling(x)));first=false;}else ctx.lineTo(X(x),Y(ceiling(x)));}ctx.stroke();
 }
 // A sparse world ruler stays readable while zoomed out.
 const grid=Math.max(1,Math.ceil(70/scale));ctx.fillStyle='#f8f9efcc';ctx.fillRect(0,H-17,W,17);ctx.fillStyle='#667969';ctx.font='9px sans-serif';ctx.textAlign='center';for(let x=Math.floor(left/grid)*grid;x<right;x+=grid)ctx.fillText(`${x}m`,X(x),H-5);
}

let cached=null,cacheKey='',lastTerrain=null,lastObstacles=null;
export function drawTerrainScene(ctx,args){
 const key=[args.W,args.H,args.scale,args.camera,args.ground,Boolean(atlas?.complete&&atlas.naturalWidth&&caveAtlas?.complete&&caveAtlas.naturalWidth)].join(':');
 if(!cached)cached=document.createElement('canvas');
 if(key!==cacheKey||lastTerrain!==args.terrain||lastObstacles!==args.obstacles){const ratio=Math.min(2,globalThis.window?.devicePixelRatio||1);cached.width=Math.max(1,Math.ceil(args.W*ratio));cached.height=Math.max(1,Math.ceil(args.H*ratio));const context=cached.getContext('2d');context.setTransform(ratio,0,0,ratio,0,0);paintTerrain(context,args);cacheKey=key;lastTerrain=args.terrain;lastObstacles=args.obstacles;}
 ctx.drawImage(cached,0,0,args.W,args.H);
}
