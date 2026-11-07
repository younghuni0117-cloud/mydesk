export const TERRAINS={meadow:'초원',hills:'언덕',stones:'돌길',stairs:'계단',construction:'공사장',rockyhills:'바위 언덕',ice:'빙판',cave:'동굴 탐험'};
export function terrainHeight(segments,x){let low=0,high=segments.length-1;while(low<=high){const mid=(low+high)>>1,s=segments[mid];if(x<s.x0)high=mid-1;else if(x>s.x1)low=mid+1;else return s.y0+(s.y1-s.y0)*(x-s.x0)/(s.x1-s.x0);}return 0;}
const cache=new Map();
export function makeTerrain(name='meadow'){
 const kind=TERRAINS[name]?name:'meadow';if(cache.has(kind))return cache.get(kind);
 let seed=18371+Object.keys(TERRAINS).indexOf(kind)*7919;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},range=(a,b)=>a+(b-a)*random();
 const segments=[],obstacles=[],decorations=[],ceilings=[];
 // Uneven authored-scale landforms with irregular widths, crests, gullies and ledges.
 const relief={meadow:.35,hills:2.8,stones:1.2,stairs:2.4,construction:1.8,rockyhills:4.2,ice:2.2,cave:3.3}[kind];
 for(const [start,end]of [[-64,-.65],[.65,96]]){let x=start,y=start<0?range(.15,relief):.16,direction=1;
  while(x<end){const width=range(kind==='stairs'?.24:.4,kind==='stairs'?.85:2.0),next=Math.min(end,x+width);if(random()<.4)direction*=-1;let ny=Math.max(.08,Math.min(relief,y+direction*range(.15,kind==='rockyhills'||kind==='cave'?1.35:.85)));if(kind==='meadow')ny=range(.05,.3);
   if(kind==='stairs'){const h=Math.max(.08,Math.min(relief,y+direction*range(.09,.4)));segments.push({x0:x,x1:next,y0:h,y1:h});y=h;}
   else{segments.push({x0:x,x1:next,y0:y,y1:ny});y=ny;}x=next;
  }
 }
 segments.push({x0:-.65,x1:.65,y0:.16,y1:.16});segments.sort((a,b)=>a.x0-b.x0);
 // Mixed clusters: gaps, sizes, types and lane assignments are independently sampled.
 let x=-61;while(x<93){x+=range(.2,kind==='meadow'?3.2:1.65);if(Math.abs(x)<.9)continue;const cluster=random()<.32?Math.floor(range(2,5)):1;
  for(let j=0;j<cluster;j++){const at=x+j*range(.09,.35);if(Math.abs(at)<.9)continue;const large=random()<({meadow:.02,hills:.12,stones:.12,stairs:.07,construction:.22,rockyhills:.38,ice:.16,cave:.3}[kind]),width=large?range(.3,.95):range(.045,.23),height=large?range(.2,kind==='rockyhills'||kind==='cave'?.95:.55):range(.025,.19),side=random()<.34?'both':random()<.5?'left':'right',shape=kind==='construction'&&random()<.36?'beam':'rock';
   obstacles.push({x:at,width,height,side,shape,variant:range(.1,.9),material:kind==='ice'?'ice':kind==='cave'&&random()<.23?'crystal':shape==='beam'?'wood':'stone'});
  }
 }
 obstacles.sort((a,b)=>a.x-b.x);
 for(let i=0;i<700;i++){const x=range(-63,95),r=random(),type=r<.26?'grass':r<.49?'bush':r<.73?'pebbles':r<.86?'fern':r<.95?'flowers':'stump';decorations.push({x,type,size:range(.05,type==='bush'?.5:.24),variant:random()});}decorations.sort((a,b)=>a.x-b.x);
 if(kind==='cave'){let clearance=3.1;for(const s of segments){const next=Math.max(1.1,Math.min(4.2,clearance+range(-.75,.75))),a=Math.abs(s.x0)<1.5?Math.max(3.3,clearance):clearance,b=Math.abs(s.x1)<1.5?Math.max(3.3,next):next;ceilings.push({x0:s.x0,x1:s.x1,y0:s.y0+a,y1:s.y1+b});clearance=next;}
  for(let i=0;i<70;i++){const x=range(-60,92);if(Math.abs(x)<1.4)continue;const ceiling=terrainHeight(ceilings,x),height=range(.15,.85);obstacles.push({x,width:range(.1,.55),height,bottom:ceiling-height+.04,side:'both',shape:'stalactite',material:'stone',variant:random()});}
 }
 const result={kind,segments,obstacles,decorations,ceilings,friction:kind==='ice'?.12:kind==='meadow'?1.15:kind==='rockyhills'?.85:.95,relief};cache.set(kind,result);return result;
}
export function rockVertices(o){const w=o.width,h=o.height,k=o.variant??.5;if(o.shape==='stalactite')return [[-w/2,h/2],[0,-h/2],[w/2,h/2]];return [[-w/2,-h/2],[w/2,-h/2],[w*(.4+.1*k),h*.04],[w*(.05+.3*k),h/2],[-w*(.12+.2*k),h*(.32+.13*k)],[-w/2,-h*.1]];}
