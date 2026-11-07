export const TERRAINS={meadow:'초원',hills:'언덕',stones:'돌길',stairs:'계단',construction:'공사장',rockyhills:'바위 언덕',ice:'빙판',cave:'동굴 탐험'};
export function terrainHeight(segments,x){let low=0,high=segments.length-1;while(low<=high){const mid=(low+high)>>1,s=segments[mid];if(x<s.x0)high=mid-1;else if(x>s.x1)low=mid+1;else return s.y0+(s.y1-s.y0)*(x-s.x0)/(s.x1-s.x0);}return 0;}
const cache=new Map();
export function makeTerrain(name='meadow'){
 const kind=TERRAINS[name]?name:'meadow';if(cache.has(kind))return cache.get(kind);
 let seed=28541+Object.keys(TERRAINS).indexOf(kind)*7919;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},range=(a,b)=>a+(b-a)*random();
 const segments=[],obstacles=[],decorations=[],ceilings=[],base=.16;
 function smoothCourse(amplitude){let x=-64,y=base;while(x<96){const width=range(4.5,9),next=Math.min(96,x+width),end=range(base,amplitude),count=Math.ceil((next-x)/.18);for(let i=0;i<count;i++){const a=i/count,b=(i+1)/count,s=t=>t*t*(3-2*t);segments.push({x0:x+(next-x)*a,x1:x+(next-x)*b,y0:y+(end-y)*s(a),y1:y+(end-y)*s(b)});}x=next;y=end;}}
 if(kind==='meadow'||kind==='ice'||kind==='stones')segments.push({x0:-64,x1:96,y0:base,y1:base});
 else if(kind==='stairs'){let x=-64,y=base,steps=0,flight=0;while(x<96){const landing=steps===0||steps>=6+flight%4,width=landing?range(1.5,2.7):range(.4,.6);if(!landing)y+=.105;segments.push({x0:x,x1:Math.min(96,x+width),y0:y,y1:y});x+=width;if(landing){steps=1;flight++;}else steps++;}}
 else smoothCourse(kind==='hills'?1.1:kind==='construction'?.55:kind==='rockyhills'?3.5:1.8);
 // Keep a level start without introducing discontinuities in the surrounding course.
 if(kind==='stairs'){const spawn=terrainHeight(segments,0);for(const s of segments){s.y0=Math.max(base,s.y0-spawn+base);s.y1=Math.max(base,s.y1-spawn+base);}}
 const populate=['hills','stones','construction','cave'].includes(kind);
 if(populate){let x=-61;while(x<93){x+=kind==='hills'?range(4,9):kind==='construction'?range(1.1,2.7):range(.35,1.6);if(Math.abs(x)<1.2)continue;const cluster=kind==='stones'&&random()<.4?Math.floor(range(2,4)):1;for(let j=0;j<cluster;j++){const at=x+j*range(.12,.35);if(Math.abs(at)<1.2)continue;let width,height,shape='rock';if(kind==='hills'){width=range(.06,.14);height=range(.025,.055);}else if(kind==='stones'){width=range(.16,.46);height=range(.035,.13);}else if(kind==='construction'){width=range(.1,.45);height=range(.035,.14);if(random()<.3){shape='beam';width=range(.25,.65);height=range(.04,.09);}}else{width=range(.1,.5);height=range(.04,.23);}const side=random()<.4?'both':random()<.5?'left':'right';obstacles.push({x:at,width,height,side,shape,variant:random(),material:kind==='cave'&&random()<.2?'crystal':shape==='beam'?'wood':'stone',rounded:kind==='stones'});}}}
 const types=kind==='construction'?['pebbles']:kind==='cave'?['pebbles','crystal']:kind==='ice'?['frost']:kind==='stones'?['pebbles']:kind==='stairs'?[]:kind==='rockyhills'?['lichen','gravel']:['grass','flowers'];
 for(let i=0;i<(kind==='construction'?180:kind==='cave'?240:420)&&types.length;i++)decorations.push({x:range(-63,95),type:types[Math.floor(random()*types.length)],size:range(.025,kind==='cave'?.13:.08),variant:random()});decorations.sort((a,b)=>a.x-b.x);
 if(kind==='cave'){let clearance=3.5;for(const s of segments){const next=Math.max(3.3,Math.min(4.8,clearance+range(-.08,.08)));ceilings.push({x0:s.x0,x1:s.x1,y0:s.y0+clearance,y1:s.y1+next});clearance=next;}for(let i=0;i<60;i++){const x=range(-60,92);if(Math.abs(x)<1.4)continue;const ceiling=terrainHeight(ceilings,x),height=range(.12,.4);obstacles.push({x,width:range(.1,.35),height,bottom:ceiling-height+.04,side:'both',shape:'stalactite',material:'stone',variant:random()});}}
 obstacles.sort((a,b)=>a.x-b.x);
 const result={kind,segments,obstacles,decorations,ceilings,friction:kind==='ice'?0:kind==='meadow'?1.15:.95,relief:Math.max(...segments.map(s=>Math.max(s.y0,s.y1)))};cache.set(kind,result);return result;
}
export function rockVertices(o){const w=o.width,h=o.height,k=o.variant??.5;if(o.shape==='stalactite')return [[-w/2,h/2],[0,-h/2],[w/2,h/2]];if(o.rounded)return [[-w*.48,-h*.5],[w*.48,-h*.5],[w*.5,h*.02],[w*.34,h*.34],[w*.12,h*.5],[-w*.19,h*.46],[-w*.41,h*.24],[-w*.5,-h*.04]];return [[-w/2,-h/2],[w/2,-h/2],[w*(.4+.1*k),h*.04],[w*(.05+.3*k),h/2],[-w*(.12+.2*k),h*(.32+.13*k)],[-w/2,-h*.1]];}
