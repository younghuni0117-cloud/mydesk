export const TERRAINS={meadow:'초원',hills:'언덕',stones:'돌길',stairs:'계단',construction:'공사장',rockyhills:'바위 언덕',ice:'빙판'};
export function terrainHeight(segments,x){const s=segments.find(s=>x>=s.x0&&x<=s.x1);return s?s.y0+(s.y1-s.y0)*(x-s.x0)/(s.x1-s.x0):0;}
export function makeTerrain(name='meadow'){
 const kind=TERRAINS[name]?name:'meadow',level=({meadow:1,hills:1,stones:2,stairs:2,construction:2,rockyhills:3,ice:3})[kind],segments=[],obstacles=[];
 if(kind==='hills'||kind==='rockyhills')for(let x=-2;x<32;x+=.5){const height=x=>x<=-2?0:(kind==='rockyhills'?.5:.2)*(1-Math.cos((x+2)*(kind==='rockyhills'?1.35:1.1)))/2;segments.push({x0:x,x1:x+.5,y0:height(x),y1:height(x+.5)});}
 if(kind==='stairs')for(let i=0;i<32;i++){const x=i*.45,height=(.045+.025*level)*Math.min(6,i<16?i:32-i);segments.push({x0:x,x1:x+.45,y0:height,y1:height});}
 if(kind==='construction'||kind==='stones'||kind==='rockyhills')for(let i=0;i<22;i++){const side=i%2?'right':'left';obstacles.push({x:.65+i*.75,width:kind==='stones'?.1:.18,height:(kind==='stones'?.035:.065)*level+(i%3)*.012,side,shape:'rock'});if(kind==='construction'&&i%4===3)obstacles.push({x:1.05+i*.75,width:.25,height:.07*level,side:'both'});}
 return {kind,level,segments,obstacles,friction:kind==='ice'?.15:kind==='meadow'?1.15:.95};
}

export function rockVertices(o){const w=o.width,h=o.height;return [[-w/2,-h/2],[w/2,-h/2],[w*.48,h*.05],[w*.16,h/2],[-w*.22,h*.42],[-w/2,-h*.1]];}
