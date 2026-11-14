import test from 'node:test';
import assert from 'node:assert/strict';
import {restaurantPayload,photoURL,RestaurantStore} from '../restaurant-data.mjs';
import {project,unproject} from '../restaurant-map.mjs';
const id='95660ae0-f996-46eb-a015-84273c728601',photo=id+'/fd547b8c-8521-4eee-aaee-c49d25be9184.png';
const record=()=>({id,name:' 정원칼국수 ',address:'의왕시 능안길 146',lat:37.37117,lon:126.98878,photos:[photo]});
test('validate positions, dates and menu photo paths before storing records',()=>{
 assert.equal(restaurantPayload(record()).name,'정원칼국수');
 for(const invalid of [{lat:0},{lon:180},{lat:'NaN'},{visited_on:'2026-02-30'},{photos:['https://evil.test/image.svg']},{photos:['c54684da-f2c5-4dcc-9950-54dce1fe3902/'+photo.split('/')[1]]}])assert.throws(()=>restaurantPayload({...record(),...invalid}));
 assert.equal(photoURL('javascript:alert(1)'),'');assert.match(photoURL(photo),/\/storage\/v1\/object\/public\/restaurant-menus\//);
 const [x,y]=project(37.37117,126.98878),r=unproject(x,y);assert.ok(Math.abs(r.lat-37.37117)<1e-8);assert.ok(Math.abs(r.lon-126.98878)<1e-8);
});
test('create retries confirm identical saved data without overwriting; edits use revision',async()=>{
 const requests=[],data=restaurantPayload(record());const store=new RestaurantStore({fetcher:async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify(options.method==='POST'?[]:[{...data,revision:2}]),{status:200});}});
 assert.equal((await store.save(record())).revision,2);assert.equal(requests[0].options.headers.Prefer,'resolution=ignore-duplicates,return=representation');assert.equal(requests[1].options.method,undefined);
 await store.save(record(),2);assert.match(requests[2].url,/revision=eq.2/);assert.equal(requests[2].options.method,'PATCH');
});
test('empty revision update and invalid image formats surface errors',async()=>{
 const store=new RestaurantStore({fetcher:async()=>new Response('[]',{status:200})});await assert.rejects(store.save(record(),2),/다른 기기/);await assert.rejects(store.upload(id,new Blob(['x'],{type:'image/svg+xml'})),/JPG/);
});
