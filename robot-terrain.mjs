// Display order reflects increasing default terrain difficulty; seeds remain independent.
export const TERRAINS={training:'강화학습 훈련소',meadow:'초원',desert:'사막',stones:'돌길',hills:'언덕',stairs:'계단',construction:'공사장',ice:'빙판',cave:'동굴 탐험'};
const terrainSeeds={meadow:0,hills:1,stones:2,stairs:3,construction:4,desert:5,ice:6,cave:7};
export function terrainHeight(segments,x){let low=0,high=segments.length-1;while(low<=high){const mid=(low+high)>>1,s=segments[mid];if(x<s.x0)high=mid-1;else if(x>s.x1)low=mid+1;else return s.y0+(s.y1-s.y0)*(x-s.x0)/(s.x1-s.x0);}return 0;}
const cache=new Map();
export function makeTerrain(name='meadow',variant=0){
 variant=Number.isInteger(variant)&&variant>=0&&variant<4?variant:0;
 if(name==='training')name='meadow';
 const kind=name==='rockyhills'?'desert':TERRAINS[name]?name:'meadow';const cacheKey=kind+':'+variant;if(cache.has(cacheKey))return cache.get(cacheKey);
 let seed=28541+terrainSeeds[kind]*7919+variant*104729;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},range=(a,b)=>a+(b-a)*random();
 const segments=[],obstacles=[],decorations=[],ceilings=[],puddles=[],base=.16;
 function smoothCourse(amplitude){let x=-64,y=base;while(x<96){const width=range(4.5,9),next=Math.min(96,x+width),end=range(base,amplitude),count=Math.ceil((next-x)/.18);for(let i=0;i<count;i++){const a=i/count,b=(i+1)/count,s=t=>t*t*(3-2*t);segments.push({x0:x+(next-x)*a,x1:x+(next-x)*b,y0:y+(end-y)*s(a),y1:y+(end-y)*s(b)});}x=next;y=end;}}
 if(kind==='meadow'||kind==='ice')segments.push({x0:-64,x1:96,y0:base,y1:base});
 else if(kind==='stairs'){segments.push({x0:-64,x1:.55,y0:base,y1:base});let x=.55,y=base,steps=0,flight=0;while(x<96){const landing=steps>=12+flight%5,width=landing?range(1.5,2.7):range(.32,.45);if(!landing)y+=.17;segments.push({x0:x,x1:Math.min(96,x+width),y0:y,y1:y});x+=width;if(landing){steps=0;flight++;}else steps++;}}
 else smoothCourse(kind==='hills'?3.3:kind==='construction'?.55:kind==='desert'?1.5:kind==='stones'?.85:1.8);
 // Raise the hill profile from the previous ~38 degree maximum to ~48 degrees.
 if(kind==='hills')for(const s of segments){s.y0=base+(s.y0-base)*1.8;s.y1=base+(s.y1-base)*1.8;}
 // Cave relief is exactly five times the previous floor profile, keeping headroom.
 if(kind==='cave')for(const s of segments){s.y0=base+(s.y0-base)*5;s.y1=base+(s.y1-base)*5;}
 // Stone pools carve continuous shallow basins into the rolling floor. Water is not a solid obstacle.
 if(kind==='stones'){
  const starts=[1.15,-3.5];let x=-61;while(x<92){x+=range(4,7);if(Math.abs(x)<4)continue;starts.push(x);}
  for(const [i,start] of starts.entries()){const large=i===0||random()>.55,width=large?range(1.6,3):range(.45,1.05),inside=segments.filter(s=>s.x0>=start&&s.x1<=start+width);if(inside.length<2||puddles.some(p=>start<p.x1+.3&&start+width>p.x0-.3))continue;
   const x0=inside[0].x0,x1=inside.at(-1).x1,a=inside[0].y0,b=inside.at(-1).y1,depth=large?range(.13,.23):range(.05,.1),bottom=Math.max(.02,Math.min(a,b)-depth),level=Math.min(a,b)-depth*.15,smooth=t=>t*t*(3-2*t);
   const floor=at=>{const t=(at-x0)/(x1-x0);return t<.4?a+(bottom-a)*smooth(t/.4):t>.6?bottom+(b-bottom)*smooth((t-.6)/.4):bottom;};
   for(const s of inside){s.y0=floor(s.x0);s.y1=floor(s.x1);if((s.y0+s.y1)/2<level)s.friction=.25;}
   const wet=inside.filter(s=>Math.min(s.y0,s.y1)<level),first=wet[0],last=wet.at(-1);if(!first)continue;
   const left=first.y0<=level?first.x0:first.x0+(first.x1-first.x0)*(level-first.y0)/(first.y1-first.y0),right=last.y1<=level?last.x1:last.x0+(last.x1-last.x0)*(level-last.y0)/(last.y1-last.y0);
   puddles.push({x0:left,x1:right,level,depth,large});
  }puddles.sort((a,b)=>a.x0-b.x0);
 }
 // Keep a level start without introducing discontinuities in the surrounding course.
 if(kind==='stairs'){const spawn=terrainHeight(segments,0);for(const s of segments){s.y0=Math.max(base,s.y0-spawn+base);s.y1=Math.max(base,s.y1-spawn+base);}}
 const populate=['hills','stones','construction'].includes(kind);
 if(populate){let x=-61;while(x<93){x+=kind==='hills'?range(4,9):kind==='construction'?range(.55,1.3):range(.35,1.6);if(Math.abs(x)<1.2)continue;const cluster=kind==='stones'&&random()<.4?Math.floor(range(2,4)):1;for(let j=0;j<cluster;j++){const at=x+j*range(.12,.35);if(Math.abs(at)<1.2)continue;let width,height,shape='rock';if(kind==='hills'){width=range(.06,.14);height=range(.025,.055);}else if(kind==='stones'){width=range(.16,.46);height=range(.035,.13);}else if(kind==='construction'){const item=random();if(item<.22){width=range(.12,.36);height=range(.04,.12);}else if(item<.42){shape='crate';width=range(.25,.42);height=range(.18,.3);}else if(item<.62){shape='pallet';width=range(.4,.7);height=range(.07,.12);}else if(item<.8){shape='pipe';width=height=range(.14,.24);}else{shape='barrier';width=range(.32,.55);height=range(.18,.27);}}else{width=range(.1,.5);height=range(.04,.23);}const side=random()<.4?'both':random()<.5?'left':'right';obstacles.push({x:at,width,height,side,shape,variant:random(),material:kind==='cave'&&random()<.2?'crystal':['crate','pallet'].includes(shape)?'wood':shape==='pipe'||shape==='barrier'?'metal':'stone',rounded:kind==='stones'});}}}
 const types=kind==='construction'?['pebbles']:kind==='cave'?[]:kind==='ice'?['frost']:kind==='stones'?['pebbles']:kind==='stairs'?[]:kind==='desert'?['sand']:['grass','flowers'];
 for(let i=0;i<(kind==='construction'?180:kind==='cave'?240:420)&&types.length;i++)decorations.push({x:range(-63,95),type:types[Math.floor(random()*types.length)],size:range(.025,kind==='cave'?.13:.08),variant:random()});decorations.sort((a,b)=>a.x-b.x);
 if(kind==='cave'){let clearance=3.5;for(const s of segments){const next=Math.max(3.3,Math.min(4.8,clearance+range(-.08,.08)));ceilings.push({x0:s.x0,x1:s.x1,y0:s.y0+clearance,y1:s.y1+next});clearance=next;}}
 obstacles.sort((a,b)=>a.x-b.x);
 const result={kind,variant,segments,obstacles,decorations,ceilings,puddles,friction:kind==='ice'?0:kind==='meadow'?1.15:kind==='desert'?.65:.95,relief:Math.max(...segments.map(s=>Math.max(s.y0,s.y1)))};cache.set(cacheKey,result);return result;
}
export function rockVertices(o){const w=o.width,h=o.height,k=o.variant??.5;if(o.shape==='stalactite')return [[-w/2,h/2],[0,-h/2],[w/2,h/2]];if(o.rounded)return [[-w*.48,-h*.5],[w*.48,-h*.5],[w*.5,h*.02],[w*.34,h*.34],[w*.12,h*.5],[-w*.19,h*.46],[-w*.41,h*.24],[-w*.5,-h*.04]];return [[-w/2,-h/2],[w/2,-h/2],[w*(.4+.1*k),h*.04],[w*(.05+.3*k),h/2],[-w*(.12+.2*k),h*(.32+.13*k)],[-w/2,-h*.1]];}
