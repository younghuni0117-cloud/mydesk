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
assert.equal(await page.locator('h1').count(),0);
assert.equal(await page.locator('#tab-models').count(),0);
const ordered=await page.evaluate(()=>{
 const top=document.querySelector('#panel-data').getBoundingClientRect().top;
 const middle=document.querySelector('.lab-dashboard').getBoundingClientRect().top;
 const bottom=document.querySelector('#panel-test').getBoundingClientRect().top;
 return top<middle&&middle<bottom;
});
assert.ok(ordered);
await page.locator('#example-choice').selectOption('long-technology');
assert.ok((await page.locator('#doc-list').textContent()).includes('컴퓨터가 글을 다루는 방법'));
await page.locator('#new-from-data').click();
await page.waitForFunction(()=>document.querySelector('#active-documents').textContent.includes('컴퓨터가 글을 다루는 방법'));
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
await page.locator('#dataset-files').setInputFiles({name:'내 장문.txt',mimeType:'text/plain',buffer:Buffer.from('나는 학교에 간다. 친구는 책을 읽는다. 우리는 집에 간다. 오늘은 공원에서 친구를 만났다.')});
await page.waitForFunction(()=>document.querySelector('#doc-list').textContent.includes('내 장문.txt'));
await page.locator('#clear-all').click();
await page.getByRole('button',{name:'취소',exact:true}).click();
assert.ok(Number((await page.locator('#status-step').textContent()).replace(/,/g,''))>=20);
await page.locator('#clear-all').click();
await page.locator('#confirm-clear').click();
await page.waitForFunction(()=>document.querySelector('#status-step').textContent==='0');
await page.locator('#train-start:not([disabled])').waitFor();
const reset=await page.evaluate(async()=>{
 const {list}=await import('./llm/storage.mjs');
 return {models:(await list('models')).length,history:(await list('history')).length};
});
assert.deepEqual(reset,{models:1,history:0});
assert.deepEqual(errors,[]);
await page.screenshot({path:'/tmp/llm-ordered.png',fullPage:true});
console.log('PASS dataset order, long samples, TXT upload, reset cancellation and clear,  exact step completion, generation while training, token probability display, pause');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
