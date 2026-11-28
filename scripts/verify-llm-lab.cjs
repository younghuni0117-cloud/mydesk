// A persistent browser profile exercises a real close/reopen without touching the live site.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {mkdtemp,rm}=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const base=process.env.PAGE_BASE||'http://127.0.0.1:3000';
const executablePath=process.env.CHROMIUM_PATH||'/usr/bin/chromium';

function pdf() {
  const stream='BT /F1 18 Tf 40 120 Td (Training data from PDF.) Tj ET';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'
  ];
  let out='%PDF-1.4\n';
  const offsets=objects.map((object,index)=>{
    const offset=out.length;
    out+=(index+1)+' 0 obj\n'+object+'\nendobj\n';
    return offset;
  });
  const xref=out.length;
  out+='xref\n0 6\n0000000000 65535 f \n'+offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('');
  out+='trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n'+xref+'\n%%EOF\n';
  return Buffer.from(out);
}

function docx() {
  const {deflateRawSync}=require('node:zlib');
  const name=Buffer.from('word/document.xml');
  const xml=Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Training data from DOCX.</w:t></w:r></w:p></w:body></w:document>');
  const compressed=deflateRawSync(xml);
  const local=Buffer.alloc(30), entry=Buffer.alloc(46), end=Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8,8);
  local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(xml.length,22);local.writeUInt16LE(name.length,26);
  entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(8,10);
  entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(xml.length,24);entry.writeUInt16LE(name.length,28);
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
  end.writeUInt32LE(entry.length+name.length,12);end.writeUInt32LE(local.length+name.length+compressed.length,16);
  return Buffer.concat([local,name,compressed,entry,name,end]);
}

(async()=>{
  const profile=await mkdtemp(path.join(os.tmpdir(),'mydesk-llm-profile-'));
  let context;
  const errors=[];
  async function open(){
    context=await chromium.launchPersistentContext(profile,{executablePath,
      args:['--no-sandbox'], viewport:{width:344,height:850}, isMobile:true, hasTouch:true});
    await context.route('**/rest/v1/**',route=>route.fulfill({json:[]}));
    const page=context.pages()[0];
    page.on('pageerror',error=>errors.push(error.message));
    return page;
  }
  async function resume(page){
    await page.locator('#train-start:not([disabled])').waitFor();
  }
  const step=page=>page.locator('#status-step').textContent().then(value=>Number(value.replace(/,/g,'')));
  async function waitForStep(page,target){
    await page.waitForFunction(n=>Number(document.querySelector('#status-step').textContent.replace(/,/g,''))>=n,target);
  }
  try {
    let page=await open();
    await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'메뉴 열기'}).click();
    await page.locator('#sidebar summary').filter({hasText:'LLM 만들기'}).click();
    await page.getByRole('link',{name:'LLM 성장시키기'}).click();
    await resume(page);
    assert.equal(await step(page),0);
    await page.waitForSelector('#probabilities meter');
    const initial=await page.locator('#probabilities').innerText();
    await page.locator('#train-start').click();
    await waitForStep(page,115);
    assert.ok((await page.locator('#checkpoint-library').textContent()).includes('자동'));
    for(const viewport of [{width:880,height:700},{width:744,height:870},{width:850,height:344},{width:344,height:850}]) {
      const before=await step(page);
      await page.setViewportSize(viewport);
      await page.locator('#expand-chart').click();
      await page.locator('#chart-dialog').getByRole('button',{name:'닫기'}).click();
      const layout=await page.evaluate(()=>({
        width:document.documentElement.clientWidth, scroll:document.documentElement.scrollWidth,
        bottom:document.querySelector('#train-save').getBoundingClientRect().bottom,
        height:innerHeight
      }));
      assert.ok(layout.scroll<=layout.width+1,JSON.stringify(layout));
      assert.ok(layout.bottom<=layout.height,JSON.stringify(layout));
      assert.ok(await step(page)>=before);
    }
    await page.locator('#train-pause').click();
    await resume(page);
    const saved=await step(page);
    assert.ok(saved>=115);
    assert.match(await page.locator('#lab-message').textContent(),/저장했습니다/);
    await page.locator('#predict-form').getByRole('button',{name:'확률 계산'}).click();
    await page.waitForFunction(n=>document.querySelector('#predict-step').textContent.includes(String(n)),saved);
    assert.notEqual(await page.locator('#probabilities').innerText(),initial);
    assert.match(await page.locator('#predict-summary').textContent(),/1\.00000000/);
    const trained=await page.locator('#probabilities').innerText();

    await context.close();
    page=await open();
    await page.goto(base+'/llm-lab.html',{waitUntil:'domcontentloaded'});
    await resume(page);
    assert.equal(await step(page),saved);
    await page.waitForSelector('#probabilities meter');
    assert.equal(await page.locator('#probabilities').innerText(),trained);
    assert.match(await page.locator('#lab-message').textContent(),/준비/);
    await page.locator('#train-start').click();
    await waitForStep(page,saved+12);
    await page.locator('#train-stop').click();
    await resume(page);
    assert.ok(await step(page)>=saved+12);
    await page.locator('#tab-attention').click();
    await page.locator('#attention-map button').first().click();
    assert.match(await page.locator('#attention-caption').textContent(),/1\.000000/);
    await page.locator('#tab-weights').click();
    await page.waitForSelector('#weights-table tbody tr');
    assert.ok(await page.locator('#weights-table tbody tr').count()>=8);
    await page.locator('#tab-test').click();
    await page.locator('#test-checkpoint').selectOption({index:1});
    await page.getByRole('button',{name:'문장 생성'}).click();
    await page.locator('#test-save:not([disabled])').waitFor();
    await page.locator('#test-save').click();
    await page.getByText('생성 결과를 저장했습니다.').waitFor({state:'attached'});
    await page.locator('#run-eval').click();
    await page.waitForFunction(()=>document.querySelector('#eval-results').textContent.includes('고정 평가'));
    await page.locator('#tab-data').click();
    await page.locator('#dataset-files').setInputFiles([
      {name:'fixture.txt',mimeType:'text/plain',buffer:Buffer.from('Training data from TXT.')},
      {name:'fixture.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:docx()},
      {name:'fixture.pdf',mimeType:'application/pdf',buffer:pdf()}
    ]);
    for(const [extension,text] of [['txt','TXT'],['docx','DOCX'],['pdf','PDF']]) {
      const item=page.locator('#doc-list summary').filter({hasText:'fixture.'+extension});
      await item.click();
      assert.ok((await item.locator('..').textContent()).includes('Training data from '+text+'.'));
    }
    await page.locator('#apply-data').click();
    await page.waitForFunction(()=>document.querySelector('#lab-message').textContent.includes('어휘'));
    await page.locator('#tab-models').click();
    await page.locator('#new-model').click();
    await page.locator('#new-name').fill('업로드 검증');
    await page.locator('#model-form').getByRole('button',{name:'생성',exact:true}).click();
    await page.locator('#model-dialog').waitFor({state:'hidden'});
    assert.equal(await step(page),0);
    assert.equal(await page.locator('#model-library [data-restore]').count(),2);
    const storage=await page.evaluate(async()=>{
      const {get,list,save}=await import('./llm/storage.mjs');
      const [original]=await list('models');
      const state=await get('states',original.key);
      const put=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(...args){
        if(this.name==='states') throw new DOMException('Injected quota failure','QuotaExceededError');
        return put.call(this,...args);
      };
      let rejected=false;
      try { await save(state,original,original.key,'수동'); }
      catch { rejected=true; }
      finally { IDBObjectStore.prototype.put=put; }
      const recovery=await get('models',original.id);
      const stillReadable=await get('states',original.key);
      let conflict=false;
      try { await save(state,original,'obsolete','수동'); } catch { conflict=true; }
      return {rejected,previous:recovery.key===original.key&&!!stillReadable,conflict};
    });
    assert.deepEqual(storage,{rejected:true,previous:true,conflict:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: menu, training, Fold viewport checks, attention, generation, TXT/DOCX/PDF, real browser restart, and atomic checkpoint failure recovery.');
  } finally {
    await context?.close();
    await rm(profile,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
