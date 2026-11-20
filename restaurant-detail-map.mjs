// Lazy street map: no tile requests until a visitor opens the neighbourhood view.
export class FoodDetailMap {
 constructor({host,onSelect,onChange}) {
  this.host=host;this.onSelect=onSelect;this.onChange=onChange;this.active=false;
  this.container=document.createElement('div');this.container.id='food-detail-map';this.container.hidden=true;this.container.setAttribute('aria-label','동네 상세지도, 두 손가락으로 확대·축소');host.append(this.container);
  this.status=document.createElement('p');this.status.className='food-detail-status';this.status.setAttribute('role','status');this.status.hidden=true;host.append(this.status);
 }
 open(center,zoom=14) {
  if(!window.L){this.status.hidden=false;this.status.textContent='상세지도를 불러오지 못했어요. 전국·지역 지도는 계속 사용할 수 있어요.';return;}
  this.active=true;this.container.hidden=false;this.host.classList.add('is-detail');
  if(!this.map){const L=window.L;this.map=L.map(this.container,{zoomControl:false,minZoom:6,maxZoom:19,zoomSnap:.25,touchZoom:true,scrollWheelZoom:true,maxBounds:[[30,121],[41,135]],maxBoundsViscosity:.8});
   this.tiles=L.tileLayer('https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> · <a href="https://www.hotosm.org/" target="_blank" rel="noopener noreferrer">HOT</a> · <a href="https://www.openstreetmap.fr/" target="_blank" rel="noopener noreferrer">OSM France</a>',updateWhenIdle:true,keepBuffer:1});
   this.tiles.on('loading',()=>{this.errors=0;this.status.hidden=false;this.status.textContent='동네 지도를 불러오고 있어요…';});
   this.tiles.on('tileerror',()=>{this.errors=(this.errors||0)+1;this.status.hidden=false;this.status.textContent='일부 지도를 불러오지 못했어요. 인터넷 연결을 확인하거나 지역 지도로 돌아가 주세요.';});
   this.tiles.on('load',()=>{if(!this.errors){this.status.hidden=true;this.status.textContent='';}});this.tiles.addTo(this.map);this.markers=L.layerGroup().addTo(this.map);
   this.map.on('zoomend moveend',()=>{this.container.dataset.zoom=String(this.map.getZoom());});
  }
  this.map.invalidateSize();this.map.setView([center.lat,center.lon],Math.max(6,Math.min(19,zoom)),{animate:false});this.onChange?.(true);
 }
 close(){if(!this.active)return;this.active=false;this.container.hidden=true;this.status.hidden=true;this.host.classList.remove('is-detail');this.onChange?.(false);}
 setRows(rows,selected){if(!this.markers)return;this.markers.clearLayers();const L=window.L;
  for(const row of rows){const flag=document.createElement('div');flag.className='food-detail-flag'+(row.id===selected?' is-active':'');flag.dataset.restaurant=row.id;flag.innerHTML='<svg viewBox="0 0 20 30" aria-hidden="true"><path d="M5 28V3" stroke="#697860" stroke-width="1.5"/><path d="M6 3Q12 0 18 4V14Q12 10 6 13Z" fill="'+(row.id===selected?'#b76845':'#638366')+'"/></svg>';
   const marker=L.marker([row.lat,row.lon],{icon:L.divIcon({html:flag,className:'food-detail-marker',iconSize:[28,32],iconAnchor:[14,30]}),title:row.name,alt:row.name,keyboard:true});
   const label=document.createElement('span');label.className='food-detail-label';label.textContent=row.name;flag.append(label);marker.on('click',()=>this.onSelect(row.id));this.markers.addLayer(marker);marker.getElement()?.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();this.onSelect(row.id);}});
  }
 }
 scale(f){if(this.active)this.map.setZoom(this.map.getZoom()+Math.log2(f),{animate:false});}
 destroy(){this.map?.remove();this.container.remove();this.status.remove();}
}
