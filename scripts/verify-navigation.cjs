// Every data/auth API call is mocked. Published menus, blog posts and other user data are untouched.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const {DEFAULT_MENUS,validateMenus,removeMenu}=await import('../navigation-data.mjs');let navigation={id:'main',menus:structuredClone(DEFAULT_MENUS),revision:0},rows=JSON.parse(fs.readFileSync(path.join(__dirname,'../blog-seed.json'))).map(p=>({...p,menu_id:p.category==='ai'?'reinforcement-learning':'physicsnemo',created_at:'2026-11-09T00:00:00Z',updated_at:'2026-11-09T00:00:00Z',revision:1})),conflict=false;
const original=rows.find(p=>p.id==='physicsnemo'),originalBody=original.body,originalDate=original.created_at,key='A'.repeat(43),errors=[];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 async function newPage(){const context=await browser.newContext({viewport:{width:390,height:844}});await context.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),auth=req.headers()['x-client-info']==='mydesk-blog/'+key;
  if(url.pathname.endsWith('/blog_management_status'))return route.fulfill({json:{connected:auth,password_set:false}});
  if(url.pathname.endsWith('/site_navigation'))return route.fulfill({json:[navigation]});
  if(url.pathname.endsWith('/blog_navigation_save')){
   if(!auth)return route.fulfill({status:403,json:{message:'먼저 연결해 주세요.'}});const args=req.postDataJSON();
   if(conflict||args.expected_revision!==navigation.revision)return route.fulfill({status:409,json:{message:'다른 기기에서 메뉴가 변경되었습니다. 새로고침 후 다시 시도해 주세요.'}});
   validateMenus(args.new_menus);const next=structuredClone(rows);for(const move of args.post_moves)for(const p of next)if(p.menu_id===move.from_id){p.menu_id=move.to_id;p.revision++;}
   if(next.some(p=>!args.new_menus.some(m=>m.id===p.menu_id&&m.kind==='folder')))return route.fulfill({status:400,json:{message:'남아 있는 글을 먼저 이동해 주세요.'}});
   rows=next;navigation={...navigation,menus:args.new_menus,revision:navigation.revision+1};return route.fulfill({json:navigation});
  }
  assert.ok(url.pathname.endsWith('/blog_posts'),'Unexpected calendar/robot access');
  if(req.method()==='GET')return route.fulfill({json:rows});
  assert.ok(auth);assert.equal(req.method(),'PATCH');const id=url.searchParams.get('id').slice(3),revision=Number(url.searchParams.get('revision').slice(3)),p=rows.find(p=>p.id===id&&p.revision===revision);if(!p)return route.fulfill({json:[]});Object.assign(p,req.postDataJSON(),{revision:p.revision+1});return route.fulfill({json:[p]});
 });const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));return p;}
 const base=process.env.PAGE_BASE||'http://127.0.0.1:8000',p=await newPage();
 await p.goto(base+'/menus.html');await p.locator('.menu-row').first().waitFor();assert.equal(await p.locator('#menu-add').isVisible(),false);assert.equal(await p.locator('.menu-row-actions').count(),0);
 await p.goto(base+'/menus.html#manage='+key);await p.locator('#menu-add').waitFor({state:'visible'});
 await p.locator('#menu-add').click();await p.locator('#menu-label').fill('새 학습 자료');await p.locator('#menu-parent').selectOption('learning');await p.locator('#menu-save').click();await p.locator('#menu-edit-dialog').waitFor({state:'hidden'});
 const created=navigation.menus.find(m=>m.label==='새 학습 자료');assert.equal(created.parent_id,'learning');
 let row=p.locator(`.menu-row[data-id="${created.id}"]`);await row.locator('[data-action="edit"]').click();await p.locator('#menu-label').fill('시험 자료');await p.locator('#menu-parent').selectOption('simulation');await p.locator('#menu-save').click();await p.locator('#menu-edit-dialog').waitFor({state:'hidden'});assert.equal(navigation.menus.find(m=>m.id===created.id).parent_id,'simulation');
 await row.locator('[data-action="up"]').click();await p.waitForFunction(()=>document.getElementById('menu-status').textContent.includes('순서'));assert.equal(navigation.menus.filter(m=>m.parent_id==='simulation')[0].id,created.id);
 // A second browser sees the same saved hierarchy.
 const second=await newPage();await second.goto(base+'/menus.html');await second.locator(`.menu-row[data-id="${created.id}"]`).waitFor();assert.match(await second.locator(`.menu-row[data-id="${created.id}"]`).textContent(),/시험 자료/);
 // Moving a blog post changes its menu only, preserving content and dates.
 await p.goto(base+'/blog.html?post=physicsnemo');await p.locator('[data-move]').click();await p.locator('#post-move-menu').selectOption(created.id);await p.locator('#post-move-save').click();await p.locator('#post-move-dialog').waitFor({state:'hidden'});assert.equal(rows.find(p=>p.id==='physicsnemo').menu_id,created.id);assert.equal(rows.find(p=>p.id==='physicsnemo').body,originalBody);assert.equal(rows.find(p=>p.id==='physicsnemo').created_at,originalDate);assert.match(await p.locator('#blog-description').textContent(),/학습정보 \/ Simulation \/ 시험 자료/);
 // Canceling deletion keeps both the menu and post; confirmed deletion transfers the post atomically.
 await p.goto(base+'/menus.html');await p.locator(`.menu-row[data-id="${created.id}"] [data-action="delete"]`).click();await p.locator('#menu-delete-cancel').click();assert.ok(navigation.menus.some(m=>m.id===created.id));
 await p.locator(`.menu-row[data-id="${created.id}"] [data-action="delete"]`).click();await p.locator('#menu-transfer').selectOption('physicsnemo');await p.locator('#menu-delete-save').click();await p.locator('#menu-delete-dialog').waitFor({state:'hidden'});assert.ok(!navigation.menus.some(m=>m.id===created.id));assert.equal(rows.find(p=>p.id==='physicsnemo').menu_id,'physicsnemo');assert.equal(rows.find(p=>p.id==='physicsnemo').body,originalBody);
 // Deleting a parent promotes its child, without deleting the child's articles.
 await p.locator('.menu-row[data-id="simulation"] [data-action="delete"]').click();await p.locator('#menu-delete-save').click();await p.locator('#menu-delete-dialog').waitFor({state:'hidden'});assert.equal(navigation.menus.find(m=>m.id==='physicsnemo').parent_id,'learning');assert.equal(rows.length,3);
 // Stale edits remain visible and do not overwrite the server.
 await p.locator('.menu-row[data-id="ai"] [data-action="edit"]').click();await p.locator('#menu-label').fill('충돌 중 입력');conflict=true;await p.locator('#menu-save').click();await p.waitForFunction(()=>document.getElementById('menu-edit-error').textContent.includes('다른 기기'));assert.equal(await p.locator('#menu-label').inputValue(),'충돌 중 입력');assert.equal(navigation.menus.find(m=>m.id==='ai').label,'AI');conflict=false;await p.locator('#menu-edit-cancel').click();
 // Long names remain readable without stretching a mobile page.
 await p.locator('.menu-row[data-id="ai"] [data-action="edit"]').click();await p.locator('#menu-label').fill('A'.repeat(80));await p.locator('#menu-save').click();await p.locator('#menu-edit-dialog').waitFor({state:'hidden'});await second.setViewportSize({width:320,height:600});await second.goto(base+'/blog.html?menu=ai');await second.locator('.blog-card').first().waitFor();assert.ok(await second.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // Responsive menu editing and expanded navigation do not overlap the footer.
 for(const width of [320,390,690,900,1440]){await p.setViewportSize({width,height:600});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);}
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:'/tmp/menu-manager-mobile.png',fullPage:true,animations:'disabled'});await p.locator('#menu-toggle').click();await p.locator('#sidebar details').evaluateAll(items=>items.forEach(d=>d.open=true));const gap=await p.locator('#sidebar').evaluate(s=>s.querySelector('.sidebar-bottom').getBoundingClientRect().top-s.querySelector('nav').getBoundingClientRect().bottom);assert.ok(gap>0);await p.keyboard.press('Escape');
 // Dynamic replacement preserves the calendar capability in links, without accessing calendar data.
 await p.evaluate(()=>localStorage.setItem('mydesk.calendar.family','11111111-1111-4111-8111-111111111111'));await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#sidebar a[href^="calendar.html"]')?.getAttribute('href').includes('#family='));
 assert.deepEqual(errors,[]);console.log('PASS: protected menu CRUD, reparenting, sibling order, cross-browser reads, post moves with preserved body/dates, delete confirmation/transfers/child promotion, stale edit protection, mobile layout/sidebar, calendar link identity.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
