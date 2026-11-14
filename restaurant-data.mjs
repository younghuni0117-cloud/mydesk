import {SHARED_MODEL_URL,SHARED_MODEL_KEY} from './robot-shared-config.mjs';
export const BUCKET='restaurant-menus';
const root=new URL(SHARED_MODEL_URL).origin;
export const PHOTO_PATH=/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpeg|png|webp)$/i;
export const photoURL=path=>PHOTO_PATH.test(path)?`${root}/storage/v1/object/public/${BUCKET}/${path}`:'';
export function restaurantPayload(input){
 const out={id:input.id,name:String(input.name||'').trim(),address:String(input.address||'').trim(),lat:Number(input.lat),lon:Number(input.lon),dish:String(input.dish||'').trim(),price:String(input.price||'').trim(),menu_text:String(input.menu_text||'').trim(),notes:String(input.notes||'').trim(),visited_on:input.visited_on||null,visit_state:input.visit_state||'saved',photos:input.photos||[]};
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(out.id||''))throw Error('기록 식별자를 확인해 주세요.');
 for(const [k,min,max] of [['name',1,100],['address',1,250],['dish',0,160],['price',0,80],['menu_text',0,3000],['notes',0,4000]])if(out[k].length<min||out[k].length>max)throw Error('식당 이름·주소와 입력 길이를 확인해 주세요.');
 if(!Number.isFinite(out.lat)||!Number.isFinite(out.lon)||out.lat<33||out.lat>39||out.lon<124||out.lon>132)throw Error('남한 지도 안의 위치를 선택해 주세요.');
 if(!['saved','visited'].includes(out.visit_state))throw Error('방문 상태를 선택해 주세요.');
 if(out.visited_on&&(!/^\d{4}-\d{2}-\d{2}$/.test(out.visited_on)||!Number.isFinite(Date.parse(out.visited_on))||new Date(out.visited_on).toISOString().slice(0,10)!==out.visited_on))throw Error('방문 날짜를 확인해 주세요.');
 if(!Array.isArray(out.photos)||out.photos.length>6||out.photos.some(p=>!PHOTO_PATH.test(p)||!p.startsWith(out.id+'/')))throw Error('메뉴판 사진은 최대 6장까지 등록할 수 있습니다.');
 return out;
}
export class RestaurantStore{
 constructor({fetcher=globalThis.fetch.bind(globalThis),token=()=>''}={}){this.fetcher=fetcher;this.token=token;this.url=SHARED_MODEL_URL.replace(/robot_shared_model$/,'restaurant_records');}
 async request(url,options={}){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),25000);try{const response=await this.fetcher(url,{credentials:'omit',cache:'no-store',...options,headers:{apikey:SHARED_MODEL_KEY,Authorization:'Bearer '+SHARED_MODEL_KEY,'x-client-info':this.token()?'mydesk-blog/'+this.token():'mydesk-restaurants',...options.headers},signal:ctl.signal});if(!response.ok)throw Error(response.status===409?'다른 기기에서 변경된 기록입니다. 새로고침 후 다시 수정해 주세요.':response.status===403?'관리 연결을 확인해 주세요.':'저장 서버에 연결하지 못했습니다. 입력은 유지됩니다. 잠시 후 다시 시도해 주세요.');return response.status===204?null:response.json();}finally{clearTimeout(timer);}}
 async list(){const rows=[];for(let offset=0;;offset+=500){const batch=await this.request(this.url+`?select=*&order=created_at.desc,id.asc&limit=500&offset=${offset}`);rows.push(...batch);if(batch.length<500)return rows;}}
 async save(input,revision=null){const data=restaurantPayload(input),isEdit=revision!==null;const result=await this.request(this.url+(isEdit?`?id=eq.${data.id}&revision=eq.${Number(revision)}`:'?on_conflict=id'),{method:isEdit?'PATCH':'POST',headers:{'Content-Type':'application/json',Prefer:isEdit?'return=representation':'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(data)});if(!isEdit&&!result?.length){const [saved]=await this.request(this.url+'?id=eq.'+data.id+'&select=*');if(saved&&Object.keys(data).every(k=>JSON.stringify(data[k])===JSON.stringify(saved[k])))return saved;}if(!result?.length)throw Error('다른 기기에서 변경되었거나 수정 권한이 없습니다. 새로고침 후 다시 시도해 주세요.');return result[0];}
 async remove(id,revision){const result=await this.request(this.url+`?id=eq.${id}&revision=eq.${Number(revision)}`,{method:'DELETE',headers:{Prefer:'return=representation'}});if(!result?.length)throw Error('다른 기기에서 변경되었거나 삭제 권한이 없습니다.');}
 async upload(id,blob){if(blob.size>8*1024*1024)throw Error('사진 한 장은 8MB 이내로 등록해 주세요.');const ext={'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'}[blob.type];if(!ext)throw Error('JPG, PNG, WebP 메뉴판 사진을 선택해 주세요.');const path=`${id}/${crypto.randomUUID()}.${ext}`;await this.request(`${root}/storage/v1/object/${BUCKET}/${path}`,{method:'POST',headers:{'Content-Type':blob.type,'Cache-Control':'3600','x-upsert':'false'},body:blob});return path;}
}
