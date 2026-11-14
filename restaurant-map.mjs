export const project=(lat,lon)=>[400+(lon-127.8)*78,40+(38.8-lat)*105];
export const unproject=(x,y)=>({lat:38.8-(y-40)/105,lon:127.8+(x-400)/78});
const svgNS='http://www.w3.org/2000/svg';
const el=(name,attrs={})=>{const n=document.createElementNS(svgNS,name);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
export function pathBounds(path){const values=path.match(/-?\d+(?:\.\d+)?/g).map(Number),xs=values.filter((_,i)=>i%2===0),ys=values.filter((_,i)=>i%2===1);return{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}
export function paintProvinces(group,paths,onRegion=null){group.replaceChildren(...paths.map(p=>{const shape=el('path',{d:p.d,class:'food-province','data-region':p.name});if(onRegion){shape.setAttribute('tabindex','0');shape.setAttribute('role','button');shape.setAttribute('aria-label',p.name+' 지도 확대');shape.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onRegion(p.name);}};const title=el('title');title.textContent=p.name+' 확대';shape.append(title);}return shape;}));}
export class FoodMap{
 constructor({paths,onSelect,onRegion=null,prefix='food',region=null,districts=[]}){
  this.$=suffix=>document.getElementById(prefix+'-'+suffix);this.host=this.$('map');this.land=this.$('land');this.provinces=this.$('provinces');this.cities=this.$('cities');this.lines=this.$('connections');this.pins=this.$('pins');this.cards=this.$('map-cards');this.onSelect=onSelect;this.onRegion=onRegion;this.region=region;this.rows=[];this.allRows=[];this.zoom=1;this.pan=[0,0];this.districts=districts;this.camera=null;this.animation=null;
  this.bounds=region?pathBounds(region.d):null;this.center=this.bounds?[this.bounds.x+this.bounds.width/2,this.bounds.y+this.bounds.height/2]:[400,350];
  this.containsContext=document.createElement('canvas').getContext('2d');if(region){this.containsPath=new Path2D(region.d);this.host.style.touchAction='none';}
  paintProvinces(this.provinces,paths,onRegion);this.details=el('g');this.land.insertBefore(this.details,this.cities);
  const defs=el('defs'),clip=el('clipPath',{id:prefix+'-clip'});this.clipPath=el('path',{d:region?.d||''});clip.append(this.clipPath);defs.append(clip);this.land.prepend(defs);this.details.setAttribute('clip-path',`url(#${prefix}-clip)`);this.defs=defs;
  this.setDistricts(districts);
  this.resize=new ResizeObserver(()=>this.draw());this.resize.observe(this.host);
  this.land.onpointerdown=e=>{if(e.button!==0&&e.pointerType==='mouse')return;this.stopAnimation();this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,pan:[...this.pan],region:e.target.closest('[data-region]')?.dataset.region,moved:false};if(e.pointerType==='mouse'||this.region)this.land.setPointerCapture(e.pointerId);};
  this.land.onpointermove=e=>{const down=this.pointer;if(!down||down.id!==e.pointerId)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.hypot(dx,dy)>6)down.moved=true;if(down.moved&&(e.pointerType==='mouse'||this.region)){this.pan=[down.pan[0]+dx,down.pan[1]+dy];this.draw();}};
  this.land.onpointerup=e=>{const down=this.pointer;this.pointer=null;if(this.land.hasPointerCapture(e.pointerId))this.land.releasePointerCapture(e.pointerId);if(down&&!down.moved&&down.region)this.onRegion?.(down.region);};this.land.onpointercancel=()=>this.pointer=null;
  this.$('zoom-in').onclick=()=>this.scale(1.35);this.$('zoom-out').onclick=()=>this.scale(1/1.35);this.$('fit').onclick=()=>this.returnToNational();
 }
 destroy(){this.stopAnimation();this.resize.disconnect();this.details.remove();this.defs?.remove();}
 setDistricts(districts){this.districts=districts;this.details?.replaceChildren(...districts.map(d=>el('path',{d:d.d,class:'food-district'})));this.draw();}
 scale(f){this.stopAnimation();this.zoom=Math.max(1,Math.min(this.region?8:6,this.zoom*f));if(this.zoom===1)this.pan=[0,0];this.animateCamera(260);}
 setRows(rows,selected){this.allRows=rows;this.rows=this.region?rows.filter(r=>{const[x,y]=project(r.lat,r.lon);return this.containsContext.isPointInPath(this.containsPath,x,y,'evenodd');}):rows;this.selected=selected;this.draw();}
 xy(x,y){return[(x-this.camera.x)*this.s+this.w/2,(y-this.camera.y)*this.s+this.h/2];}
 point(row){return this.xy(...project(row.lat,row.lon));}
 draw(){
  this.w=this.host.clientWidth;this.h=this.host.clientHeight;if(!this.w||!this.h)return;
  if(!this.animation)this.camera=this.targetCamera();this.s=this.camera.scale;
  const t=`translate(${this.w/2} ${this.h/2}) scale(${this.s}) translate(${-this.camera.x} ${-this.camera.y})`;
  this.land.setAttribute('viewBox',`0 0 ${this.w} ${this.h}`);this.lines.setAttribute('viewBox',`0 0 ${this.w} ${this.h}`);this.provinces.setAttribute('transform',t);this.details?.setAttribute('transform',t);this.cities.replaceChildren();
  const labels=this.region?this.districts.map(d=>[d.name,...d.center]):[['서울',...project(37.57,126.98)],['대전',...project(36.35,127.38)],['부산',...project(35.18,129.07)],['제주',...project(33.39,126.55)]];
  const occupied=[];this.cityBoxes=[];for(const[name,px,py]of labels){const[x,y]=this.xy(px,py),width=name.length*(this.region?11:12)+4,box={x:x-width/2,y:y-6,w:width,h:14};if(x<12||x>this.w-12||y<10||y>this.h-10||this.region&&occupied.some(b=>box.x<b.x+b.w+4&&box.x+box.w>b.x-4&&box.y<b.y+b.h+2&&box.y+box.h>b.y-2))continue;occupied.push(box);const label=el('text',{x,y:y+(this.region?3:16),class:'food-map-city'+(this.region?' food-district-label':'')});label.textContent=name;this.cities.append(label);this.cityBoxes.push({node:label,...box});}
  this.pins.replaceChildren();this.cards.replaceChildren();this.lines.replaceChildren();
  const visible=this.rows.filter(r=>{const[x,y]=this.point(r);return x>12&&x<this.w-12&&y>20&&y<this.h-12;});
  for(const r of visible){const[x,y]=this.point(r),b=document.createElement('button');b.type='button';b.className='food-pin'+(r.id===this.selected?' is-active':'');b.style.left=x+'px';b.style.top=y+'px';b.setAttribute('aria-label',r.name+' 기록 보기');b.title=r.name;const flag=el('svg',{viewBox:'0 0 20 30','aria-hidden':'true'});flag.append(el('path',{d:'M5 28V3',stroke:'#697860','stroke-width':'1.5'}),el('path',{d:'M6 3Q12 0 18 4V14Q12 10 6 13Z',fill:r.id===this.selected?'#b76845':'#638366'}));b.append(flag);if(this.region){const label=document.createElement('span');label.className='food-pin-label';label.textContent=r.name;b.append(label);}b.onclick=()=>this.onSelect(r.id);this.pins.append(b);}
  if(this.region)this.positionPinLabels();else this.drawCards(visible);
  const empty=this.$('map-empty');if(empty)empty.hidden=this.rows.length>0;
 }
 baseScale(){return this.bounds?Math.min((this.w-54)/Math.max(.01,this.bounds.width),(this.h-70)/Math.max(.01,this.bounds.height)):Math.min(this.w/(this.w<600?650:800),this.h/700);}
 targetCamera(){const scale=this.baseScale()*this.zoom;return{x:this.center[0]-this.pan[0]/scale,y:this.center[1]-this.pan[1]/scale,scale};}
 stopAnimation(){if(!this.animation)return;cancelAnimationFrame(this.animation.frame);this.animation=null;this.host.classList.remove('is-flying');if(this.camera){this.zoom=this.camera.scale/this.baseScale();this.pan=[(this.center[0]-this.camera.x)*this.camera.scale,(this.center[1]-this.camera.y)*this.camera.scale];}}
 animateCamera(duration=820){
  const start={...(this.camera||this.targetCamera())};if(this.animation)cancelAnimationFrame(this.animation.frame);
  const animation={start:performance.now(),frame:0};this.animation=animation;this.host.classList.add('is-flying');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tick=now=>{if(this.animation!==animation)return;const t=reduced?1:Math.min(1,(now-animation.start)/duration),ease=t<.5?4*t*t*t:1-(-2*t+2)**3/2,target=this.targetCamera();this.camera={x:start.x+(target.x-start.x)*ease,y:start.y+(target.y-start.y)*ease,scale:Math.exp(Math.log(start.scale)+(Math.log(target.scale)-Math.log(start.scale))*ease)};this.draw();if(t<1)animation.frame=requestAnimationFrame(tick);else{this.animation=null;this.host.classList.remove('is-flying');this.draw();}};
  animation.frame=requestAnimationFrame(tick);
 }
 activateRegion(region){
  if(!this.region)this.nationalView={zoom:this.zoom,pan:[...this.pan]};if(this.animation)cancelAnimationFrame(this.animation.frame);this.animation=null;
  this.region=region;this.bounds=pathBounds(region.d);this.center=[this.bounds.x+this.bounds.width/2,this.bounds.y+this.bounds.height/2];this.containsPath=new Path2D(region.d);this.clipPath.setAttribute('d',region.d);this.zoom=1;this.pan=[0,0];this.districts=[];this.details.replaceChildren();this.host.style.touchAction='none';this.host.classList.add('is-region');this.host.dataset.region=region.name;
  for(const path of this.provinces.children){const active=path.dataset.region===region.name;path.classList.toggle('is-selected-region',active);path.setAttribute('tabindex',active?'0':'-1');path.setAttribute('aria-hidden',String(!active));}
  this.$('fit').textContent='전국 지도';this.onViewChange?.(region);this.rows=this.allRows.filter(r=>{const[x,y]=project(r.lat,r.lon);return this.containsContext.isPointInPath(this.containsPath,x,y,'evenodd');});this.animateCamera();
 }
 returnToNational(){
  if(this.animation)cancelAnimationFrame(this.animation.frame);this.animation=null;const view=this.region?this.nationalView:null;this.region=null;this.bounds=null;this.center=[400,350];this.zoom=view?.zoom??1;this.pan=view?.pan?[...view.pan]:[0,0];this.rows=this.allRows;this.districts=[];this.details.replaceChildren();this.host.style.touchAction='pan-y';this.host.classList.remove('is-region');delete this.host.dataset.region;
  for(const path of this.provinces.children){path.classList.remove('is-selected-region');path.setAttribute('tabindex','0');path.removeAttribute('aria-hidden');}
  this.$('fit').textContent='전체 지도';this.onViewChange?.(null);this.animateCamera();
 }
 positionPinLabels(){
  const occupied=[];for(const b of this.pins.children){const label=b.querySelector('.food-pin-label');if(!label)continue;const x=parseFloat(b.style.left),y=parseFloat(b.style.top),width=Math.min(this.w<600?146:190,label.textContent.length*11+16),height=label.textContent.length*11+16>width?44:26;label.style.width=width+'px';
   const candidates=[[24,6],[-width-2,6],[24,-22],[-width-2,-22],[24,34],[-width-2,34],[12-width/2,-24-height]];let chosen=null;
   for(const[left,top]of candidates){const box={x:x-14+left,y:y-30+top,w:width,h:height};if(box.x<6||box.x+width>this.w-6||box.y<42||box.y+height>this.h-6||occupied.some(p=>box.x<p.x+p.w+3&&box.x+box.w>p.x-3&&box.y<p.y+p.h+3&&box.y+box.h>p.y-3))continue;chosen={left,top,box};break;}
   label.hidden=!chosen;if(chosen){label.style.left=chosen.left+'px';label.style.top=chosen.top+'px';occupied.push(chosen.box);}
  }
  for(const city of this.cityBoxes||[])if(occupied.some(p=>city.x<p.x+p.w+3&&city.x+city.w>p.x-3&&city.y<p.y+p.h+3&&city.y+city.h>p.y-3))city.node.remove();
 }
 drawCards(visible){
  const sorted=visible.toSorted((a,b)=>Number(b.id===this.selected)-Number(a.id===this.selected)||a.lat-b.lat).slice(0,6),cardWidth=Math.min(210,this.w*(this.w<600?.29:.21)),sides=[[],[]];sorted.toSorted((a,b)=>b.lat-a.lat).forEach((r,i)=>sides[i%2].push(r));
  sides.forEach((rows,side)=>{const space=Math.min(143,(this.h-40)/Math.max(1,rows.length));rows.forEach((r,i)=>{const[x,y]=this.point(r),top=Math.max(22,Math.min(this.h-130,65+i*space)),left=side?this.w-cardWidth-12:12,b=document.createElement('button');b.type='button';b.className='food-map-card'+(r.id===this.selected?' is-active':'');b.style.left=left+'px';b.style.top=top+'px';b.style.width=cardWidth+'px';const region=document.createElement('small');region.textContent=r.address.split(' ').slice(0,2).join(' ');const title=document.createElement('strong');title.textContent=r.name;const dish=document.createElement('p');dish.textContent=r.dish||'메뉴를 기록해 주세요';b.append(region,title,dish);if(r.price){const price=document.createElement('span');price.className='food-card-price';price.textContent=r.price;b.append(price);}b.onclick=()=>this.onSelect(r.id);this.cards.append(b);const endX=side?left:left+cardWidth,endY=top+Math.min(70,b.offsetHeight)/2;const line=el('path',{d:`M${x},${y-9} C${(x+endX)/2},${y-9} ${(x+endX)/2},${endY} ${endX},${endY}`,class:'food-connection'+(r.id===this.selected?' is-active':'')});this.lines.append(line,el('path',{d:side?`M${endX-4} ${endY-3} L${endX} ${endY} L${endX-4} ${endY+3}`:`M${endX+4} ${endY-3} L${endX} ${endY} L${endX+4} ${endY+3}`,class:'food-connection'}));});});
 }
}
export class FoodRegions{
 constructor({paths}){
  this.paths=paths;
  const selector=document.createElement('select');selector.id='food-region-select';selector.setAttribute('aria-label','시·도 확대 지도 선택');selector.className='food-region-select';selector.append(new Option('지역 확대',''),...paths.toSorted((a,b)=>a.name.localeCompare(b.name,'ko')).map(p=>new Option(p.name,p.name)));selector.onchange=()=>{if(selector.value)this.open(selector.value);else this.map?.returnToNational();};document.querySelector('.food-map-toolbar').append(selector);this.selector=selector;
  const crumb=document.createElement('div');crumb.className='food-map-breadcrumb';crumb.id='food-map-breadcrumb';crumb.hidden=true;const back=document.createElement('button');back.type='button';back.textContent='← 전국';back.setAttribute('aria-label','전국 지도로 돌아가기');back.onclick=()=>this.map.returnToNational();const title=document.createElement('strong');title.id='food-region-title';crumb.append(back,title);document.getElementById('food-map').append(crumb);this.crumb=crumb;
  const status=document.createElement('p');status.id='food-region-loading';status.setAttribute('role','status');document.getElementById('food-map').append(status);this.status=status;
 }
 attach(map){this.map=map;map.onViewChange=region=>{this.current=region;this.selector.value=region?.name||'';this.crumb.hidden=!region;document.getElementById('food-region-title').textContent=region?.name||'';if(!region){this.generation=(this.generation||0)+1;this.status.textContent='';}};}
 async open(name){
  const region=this.paths.find(p=>p.name===name);if(!region||!this.map)return;const generation=this.generation=(this.generation||0)+1;this.map.activateRegion(region);this.status.textContent=this.districts?'':'세부 지도를 불러오고 있어요…';
  try{if(!this.districts){this.loading??=fetch('assets/korea-food-districts.json?v=food3').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>this.districts=data).catch(error=>{this.loading=null;throw error;});await this.loading;}if(generation!==this.generation)return;this.map.setDistricts(this.districts.filter(d=>d.province===region.code));this.status.textContent='';}catch{if(generation===this.generation)this.status.textContent='세부 경계를 불러오지 못했어요. 지역을 다시 선택하면 재시도합니다.';}
 }
}
