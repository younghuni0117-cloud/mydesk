import {hasRestaurantPosition} from './restaurant-data.mjs?v=food6';
// Resolve on explicit Save only. A missing result never invents a location or blocks saving.
export async function locateRestaurant(address,{fetcher=globalThis.fetch.bind(globalThis),timeout=4000}={}){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
 try{const query=new URLSearchParams({q:address.trim(),format:'jsonv2',countrycodes:'kr',limit:'1','accept-language':'ko'});
  const r=await fetcher('https://nominatim.openstreetmap.org/search?'+query,{signal:ctl.signal,credentials:'omit',referrerPolicy:'origin'});if(!r.ok)return null;
  const result=(await r.json())?.[0];if(!result||result.lat==null||result.lon==null)return null;
  const position={lat:Number(result.lat),lon:Number(result.lon)};return hasRestaurantPosition(position)?position:null;
 }catch{return null;}finally{clearTimeout(timer);}
}
