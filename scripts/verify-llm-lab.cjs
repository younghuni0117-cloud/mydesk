const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/rest/v1/**',route=>route.fulfill({json:[]}));
await page.goto((process.env.PAGE_BASE||'http://127.0.0.1:3000')+'/llm-lab.html');
await page.locator('#train-start:not([disabled])').waitFor();
await page.locator('#training-steps').fill('20');
await page.locator('#train-start').click();
await page.waitForFunction(()=>document.querySelector('#status').textContent==='학습 완료');
assert.equal(await page.locator('#status-step').textContent(),'20');
await page.locator('#training-steps').fill('500');
await page.locator('#train-start').click();
await page.locator('#test-length').fill('4');
await page.locator('#test-form').getByRole('button',{name:'문장 생성',exact:true}).click();
await page.waitForFunction(()=>document.querySelector('#generation-status').textContent.includes('생성 완료'));
assert.ok(await page.locator('#generation-candidates meter').count()>0);
assert.ok((await page.locator('#test-results').textContent()).length>=3);
await page.locator('#train-pause').click();
await page.locator('#train-start:not([disabled])').waitFor();
assert.deepEqual(errors,[]);
for(const viewport of [{width:344,height:850},{width:880,height:700},{width:744,height:870},{width:850,height:344}]) {
 await page.setViewportSize(viewport);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
}
await page.reload();
await page.locator('#train-start:not([disabled])').waitFor();
assert.ok(Number((await page.locator('#status-step').textContent()).replace(/,/g,''))>=20);
console.log('PASS exact step completion, generation while training, token probability display, pause');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
