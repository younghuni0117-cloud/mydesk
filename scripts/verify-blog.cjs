// Blog API is fully mocked; this test never changes published content.
const {chromium}=require('playwright');
const fs=require('fs'),assert=require('node:assert/strict');
const seed=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../blog-seed.json'))).map(p=>({...p,created_at:'2026-11-09T00:00:00Z',updated_at:'2026-11-09T00:00:00Z',revision:0}));
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const errors=[];const ctx=await b.newContext();let rows=structuredClone(seed),writes=[],mode='normal';
 await ctx.route('**/rest/v1/**',async route=>{const req=route.request();assert.ok(req.url().includes('/blog_posts'),'must not access existing user data');
  if(mode==='offline')return route.fulfill({status:503,body:'unavailable'});
  const url=new URL(req.url()),id=url.searchParams.get('id')?.slice(3),revision=Number(url.searchParams.get('revision')?.slice(3));
  if(req.method()==='GET')return route.fulfill({json:rows});
  assert.equal(req.headers()['x-client-info'],'mydesk-blog/'+'A'.repeat(43));writes.push(req.method());
  if(mode==='conflict')return route.fulfill({json:[]});
  if(req.method()==='POST'){const row={...req.postDataJSON(),created_at:'2026-11-09T04:00:00Z',updated_at:'2026-11-09T04:00:00Z',revision:0};rows.push(row);return route.fulfill({json:[row],status:201});}
  const row=rows.find(p=>p.id===id&&p.revision===revision);if(!row)return route.fulfill({json:[]});
  if(req.method()==='PATCH')Object.assign(row,req.postDataJSON(),{revision:row.revision+1,updated_at:'2026-11-10T00:00:00Z'});
  if(req.method()==='DELETE')rows=rows.filter(p=>p!==row);
  return route.fulfill({json:[row]});
 });
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));const base=process.env.PAGE_BASE||'http://127.0.0.1:8000';
 await p.goto(base+'/blog.html?category=structural&topic=PhysicsNeMo');await p.locator('.blog-card').waitFor();assert.equal(await p.locator('.blog-card').count(),1);assert.equal(await p.locator('#blog-new').isVisible(),false);assert.match(await p.locator('.blog-date').textContent(),/2026/);
 await p.locator('.blog-card h2').click();await p.locator('#overview-title').waitFor();assert.equal(await p.locator('.guide-section').count(),8);assert.equal(await p.locator('.guide-source-list>li').count(),10);
 for(const width of [320,390,690,900,1440]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);}
 await p.setViewportSize({width:390,height:844});await p.locator('#menu-toggle').click();assert.equal(await p.locator('.nav-group[data-category="structural"]').getAttribute('open'),'');await p.keyboard.press('Escape');
 // Sanitizer must neutralize HTML, SVG and URL attacks before any content is attached.
 const safe=await p.evaluate(async()=>{const {sanitizeHTML}=await import('./blog-content.mjs');return sanitizeHTML('<img src=x onerror=alert(1)><script>alert(2)</script><a href="javascript:alert(3)" onclick="alert(4)">bad</a><svg><foreignObject><iframe srcdoc="bad"></iframe></foreignObject><path onload="alert(5)" fill="url(https://bad.test)"></path></svg>');});
 assert.ok(!/javascript:|onerror|onclick|onload|<script|<iframe|foreignobject|url\(/i.test(safe));
 await p.goto(base+'/blog.html?category=ai#manage='+'A'.repeat(43));await p.locator('#blog-new').waitFor({state:'visible'});assert.ok(!p.url().includes('manage='));
 await p.locator('#blog-new').click();await p.locator('#post-topic').fill('새 주제');await p.locator('#post-title').fill('새 테스트 글');await p.locator('#post-summary').fill('새 소개');await p.locator('#post-body').fill('직접 작성한 본문');await p.locator('#post-save').click();await p.locator('.blog-post-heading').waitFor();assert.equal(writes.at(-1),'POST');assert.match(await p.locator('.blog-article').textContent(),/직접 작성/);
 await p.reload();await p.locator('.blog-post-heading').waitFor();assert.match(await p.locator('.blog-post-heading').textContent(),/새 테스트 글/);
 await p.locator('[data-edit]').click();await p.locator('#post-title').fill('수정한 글');await p.locator('#post-save').click();await p.locator('.blog-post-heading h2').waitFor();assert.match(await p.locator('.blog-post-heading h2').textContent(),/수정한 글/);assert.match(await p.locator('.blog-date').textContent(),/수정/);
 // A conflict leaves the user's draft in the editor.
 await p.locator('[data-edit]').click();await p.locator('#post-title').fill('충돌 중 작성');mode='conflict';await p.locator('#post-save').click();await p.waitForFunction(()=>document.getElementById('blog-status').textContent.includes('다른 기기'));assert.equal(await p.locator('#post-title').inputValue(),'충돌 중 작성');mode='normal';
 p.once('dialog',d=>d.accept());await p.locator('#post-cancel').click();
 let before=rows.length;p.once('dialog',d=>d.dismiss());await p.locator('[data-delete]').click();assert.equal(rows.length,before);p.once('dialog',d=>d.accept());await p.locator('[data-delete]').click();await p.locator('.blog-empty').waitFor();assert.equal(rows.length,before-1);
 // Legacy deep links and author access survive page reload.
 await p.goto(base+'/physicsnemo.html#structural');await p.locator('#structural-title').waitFor();assert.match(p.url(),/blog.html\?post=physicsnemo#structural/);assert.ok(await p.locator('[data-edit]').isVisible());
 mode='offline';await p.reload();await p.locator('.guide-section').first().waitFor();assert.match(await p.locator('#blog-status').textContent(),/既存|기존/);await p.locator('[data-edit]').click();assert.equal(await p.locator('#blog-editor').isVisible(),false);mode='normal';
 await p.goto(base+'/blog.html?category=ai');await p.locator('.blog-card').first().waitFor();await p.screenshot({path:'/tmp/blog-mobile.png',fullPage:true});
 await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('.resource-list .row-category')?.textContent==='강화학습');assert.equal(await p.locator('.resource-list>a').count(),3);
 assert.deepEqual(errors,[]);console.log('PASS: category, article, dates, responsive widths, mobile menu, sanitizer, CRUD, persistence, conflict, delete confirmation, legacy links, offline, no robot/calendar API calls');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
