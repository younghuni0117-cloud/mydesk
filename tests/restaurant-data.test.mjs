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

test('blog URLs are optional, HTTPS-only, credential-free and survive saves',async()=>{
 const {safeBlogURL}=await import('../restaurant-data.mjs');
 assert.equal(restaurantPayload(record()).blog_url,'');
 for(const bad of ['javascript:alert(1)','data:text/html,test','https://user:secret@example.com/','https://example.com/'+ '가'.repeat(1000)]){
  assert.equal(safeBlogURL(bad),'');assert.throws(()=>restaurantPayload({...record(),blog_url:bad}),/블로그 주소/);
 }
 const blog='https://blog.example.com/post?id=42&x=1',payload=restaurantPayload({...record(),blog_url:blog}),requests=[];
 const store=new RestaurantStore({fetcher:async(url,options)=>{requests.push(options);return new Response(JSON.stringify([{...JSON.parse(options.body),revision:1}]),{status:200});}});
 assert.equal((await store.save({...record(),blog_url:blog},0)).blog_url,blog);
 assert.equal(JSON.parse(requests[0].body).blog_url,blog);assert.equal('source_url' in payload,false);
});


test('three-field records can save without coordinates; edits never send protected id',async()=>{
 const minimal={id,name:'세 항목 기록',address:'경기도 의왕시',blog_url:'blog.example.com/review'};
 assert.equal(restaurantPayload(minimal).lat,null);assert.equal(restaurantPayload(minimal).lon,null);assert.equal(restaurantPayload(minimal).blog_url,'https://blog.example.com/review');
 assert.equal(restaurantPayload({...minimal,blog_url:'http://blog.example.com/review'}).blog_url,'https://blog.example.com/review');
 assert.throws(()=>restaurantPayload({...minimal,lat:37.3}),/위치/);
 let body;const store=new RestaurantStore({fetcher:async(url,options)=>{body=JSON.parse(options.body);assert.equal('id' in body,false);return new Response(JSON.stringify([{id,...body,revision:2}]),{status:200});}});
 const old={...record(),dish:'기존 메뉴',menu_text:'기존 메뉴판',notes:'기존 메모',blog_url:'https://example.com/food'};
 await store.save({...old,name:'이름만 변경'},1);assert.deepEqual(body.photos,[photo]);assert.equal(body.notes,'기존 메모');assert.equal(body.dish,'기존 메뉴');
});

test('automatic address lookup treats missing, failed or invalid results as unresolved',async()=>{
 const {locateRestaurant}=await import('../restaurant-geocode.mjs');
 assert.deepEqual(await locateRestaurant('의왕시',{fetcher:async()=>new Response(JSON.stringify([{lat:'37.3',lon:'127.0'}]))}),{lat:37.3,lon:127});
 for(const result of [[],[{lat:'NaN',lon:'127'}],[{lat:'0',lon:'0'}]])assert.equal(await locateRestaurant('주소',{fetcher:async()=>new Response(JSON.stringify(result))}),null);
 assert.equal(await locateRestaurant('주소',{fetcher:async()=>{throw Error('offline');}}),null);
});
