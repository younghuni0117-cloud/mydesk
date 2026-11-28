const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

(async () => {
  const root = path.resolve(__dirname,'..');
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try {
    const page = await browser.newPage({reducedMotion:'reduce',viewport:{width:390,height:844}});
    const firstUser = '10000000-0000-4000-8000-000000000001';
    let currentUser = firstUser;
    const rows = [
      {user_id:firstUser,id:'old-answer',employee_id:'chief',kind:'chatgpt',content:'기존에 저장한 단독 답변',created_at:'2026-11-01T01:00:00Z'},
      {user_id:firstUser,id:'old-memory',employee_id:'chief',kind:'memory',revision:1,content:'간결한 보고 선호',created_at:'2026-11-02T01:00:00Z'},
    ];
    const profiles = [];
    const errors = [];
    const aiCalls = [];
    const completed = new Map();
    let modelCalls = 0;
    let failNextAi = false;
    let quotaNextAi = false;
    let staleMemory = false;
    page.on('pageerror',error => errors.push(error.message));
    await page.route('**/*',async route => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      if(url.origin === 'https://office.test') {
        try {
          return route.fulfill({body:await fs.readFile(path.join(root,url.pathname)),
            contentType:({'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript'})[path.extname(url.pathname)]});
        } catch {return route.fulfill({status:404,body:''});}
      }
      if(url.pathname.includes('/auth/v1/token')) {
        const email = route.request().postDataJSON().email;
        currentUser = email === 'second@example.test' ? '10000000-0000-4000-8000-000000000002' : firstUser;
        return route.fulfill({json:{
          access_token:'test-token',refresh_token:'test-refresh',expires_in:3600,
          user:{id:currentUser},
        }});
      }
      if(url.pathname.includes('/auth/v1/logout')) return route.fulfill({json:{}});
      if(url.pathname.includes('/functions/v1/')) {
        if(method==='GET') return route.fulfill({json:{ready:true,model:'gemini-test',message:'Gemini 키 등록됨'}});
        const data = route.request().postDataJSON();
        aiCalls.push(data);
        assert.equal(data.consent,true);
        assert.equal(data.apiKey,undefined);
        assert.equal(data.systemInstruction,undefined);
        if(quotaNextAi) {
          quotaNextAi = false;
          return route.fulfill({status:429,json:{code:'quota',message:'사용 한도 대기',retryAt:new Date(Date.now()+60000).toISOString()}});
        }
        if(completed.has(data.requestId)) return route.fulfill({json:{record:completed.get(data.requestId),reused:true}});
        modelCalls++;
        const record = {id:data.requestId,user_id:currentUser,employee_id:data.employeeId,
          kind:'gemini',question:data.question,thread_id:data.threadId,
          source_model:'gemini-test',content:'서버 Gemini 답변 '+modelCalls,created_at:new Date().toISOString()};
        rows.unshift(record);
        completed.set(data.requestId,record);
        if(failNextAi) {failNextAi = false; return route.abort();}
        return route.fulfill({json:{record}});
      }
      if(url.pathname.includes('/rest/v1/ai_office_gemini_jobs')) return route.fulfill({json:[]});
      if(url.pathname.includes('/rest/v1/ai_office_profiles')) {
        if(method === 'POST') {
          const profile = route.request().postDataJSON();
          const index = profiles.findIndex(row => row.employee_id === profile.employee_id);
          if(index >= 0) profiles[index] = profile; else profiles.push(profile);
          return route.fulfill({status:201,body:''});
        }
        return route.fulfill({json:profiles.filter(row => row.user_id === currentUser)});
      }
      if(url.pathname.includes('/rest/v1/ai_office_records')) {
        if(method === 'POST') {
          const row = route.request().postDataJSON();
          if(!rows.some(item => item.id === row.id)) rows.unshift({...row,created_at:new Date().toISOString()});
          return route.fulfill({status:201,body:''});
        }
        if(method === 'PATCH') {
          const row = rows.find(item => 'eq.' + item.id === url.searchParams.get('id'));
          if(staleMemory || !row || 'eq.' + row.revision !== url.searchParams.get('revision')) return route.fulfill({json:[]});
          Object.assign(row,route.request().postDataJSON(),{revision:row.revision+1});
          return route.fulfill({json:[row]});
        }
        if(method === 'DELETE') {
          const index = rows.findIndex(item => 'eq.' + item.id === url.searchParams.get('id'));
          if(index >= 0) rows.splice(index,1);
          return route.fulfill({status:204,body:''});
        }
        const filtered = rows.filter(row => row.user_id === currentUser &&
          (!url.searchParams.get('employee_id') || 'eq.' + row.employee_id === url.searchParams.get('employee_id')) &&
          (!url.searchParams.get('kind') || 'eq.' + row.kind === url.searchParams.get('kind')));
        const offset = Number(url.searchParams.get('offset') || 0);
        return route.fulfill({json:filtered.slice(offset,offset+100)});
      }
      if(url.pathname.includes('/rest/v1/')) return route.fulfill({json:[]});
      return route.abort();
    });

    await page.goto('https://office.test/ai-office.html');
    await page.waitForSelector('.office-actor');
    assert.equal(await page.locator('#office-build-prompt').count(),0);
    await page.getByRole('button',{name:'한유진 · AI 비서실장'}).click();
    await page.locator('#office-content').fill('일반적인 회의 준비를 도와줘');
    await page.getByRole('button',{name:'Gemini에게 질문하기',exact:true}).click();
    await page.locator('#account-dialog').waitFor({state:'visible'});
    await page.locator('#office-email').fill('test@example.test');
    await page.locator('#office-password').fill('test-password');
    await page.locator('#office-login').getByRole('button',{name:'로그인',exact:true}).click();
    await page.locator('#account-dialog').waitFor({state:'hidden'});
    await page.waitForFunction(() => document.getElementById('office-history').textContent.includes('기존에 저장한 단독 답변'));
    await page.getByRole('button',{name:'Gemini에게 질문하기',exact:true}).click();
    assert.equal(aiCalls.length,0);
    await page.locator('.office-record').filter({hasText:'간결한 보고 선호'}).getByRole('checkbox').check();
    await page.getByRole('button',{name:'기억 수정',exact:true}).click();
    await page.getByRole('textbox',{name:'기억 수정 내용'}).fill('표로 정리한 보고 선호');
    await page.getByRole('button',{name:'수정 저장',exact:true}).click();
    await page.waitForFunction(() => document.getElementById('office-history').textContent.includes('표로 정리한 보고 선호'));
    await page.locator('#office-gemini-consent').check();
    failNextAi = true;
    await page.getByRole('button',{name:'Gemini에게 질문하기',exact:true}).click();
    await page.waitForFunction(() => !document.getElementById('office-send-gemini').disabled);
    assert.equal(aiCalls.length,1);
    assert.equal(aiCalls[0].recordIds.length,1);
    await page.locator('#office-send-gemini').click();
    await page.waitForFunction(() => document.getElementById('office-history').textContent.includes('서버 Gemini 답변 1'));
    assert.equal(aiCalls[0].requestId,aiCalls[1].requestId);
    assert.equal(modelCalls,1);
    assert.equal(rows.filter(row=>row.kind==='gemini').length,1);
    const firstThread = aiCalls[0].threadId;
    assert.ok(!(await page.locator('#office-gemini-consent').isChecked()));
    await page.locator('#office-content').fill('이어서 공개 발표 준비 순서를 알려줘');
    await page.locator('#office-gemini-consent').check();
    await page.locator('#office-send-gemini').click();
    await page.waitForFunction(() => document.getElementById('office-history').textContent.includes('서버 Gemini 답변 2'));
    assert.equal(aiCalls.at(-1).threadId,firstThread);
    await page.getByRole('button',{name:'기억만 보기',exact:true}).click();
    await page.waitForFunction(() => document.querySelectorAll('.office-record').length === 1);
    staleMemory = true;
    await page.getByRole('button',{name:'기억 수정',exact:true}).click();
    await page.getByRole('textbox',{name:'기억 수정 내용'}).fill('충돌하는 기억');
    await page.getByRole('button',{name:'수정 저장',exact:true}).click();
    await page.waitForFunction(() => document.getElementById('office-chat-status').textContent.includes('다른 화면에서'));
    staleMemory = false;
    await page.getByRole('button',{name:'수정 취소',exact:true}).click();
    await page.locator('#office-profile summary').click();
    await page.locator('#office-profile-name').fill('민서');
    await page.locator('#office-profile-personality').fill('꼼꼼한 성격');
    await page.locator('#office-profile-tone').fill('짧고 명확한 존댓말');
    await page.getByRole('button',{name:'직원 설정 저장',exact:true}).click();
    await page.waitForFunction(() => document.getElementById('employee-name').textContent === '민서');
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForSelector('[aria-label="민서 · AI 비서실장"]');
    await page.getByRole('button',{name:'민서 · AI 비서실장'}).click();
    await page.waitForFunction(() => document.getElementById('office-history').textContent.includes('서버 Gemini 답변 2'));
    await page.getByRole('button',{name:'새 상담 시작',exact:true}).click();
    await page.locator('.office-record').filter({hasText:'기존에 저장한 단독 답변'}).getByRole('button',{name:'이 상담 이어하기'}).click();
    await page.locator('#office-content').fill('일반적인 후속 질문');
    await page.locator('#office-gemini-consent').check();
    quotaNextAi = true;
    await page.clock.install({time:new Date()});
    await page.locator('#office-send-gemini').click();
    await page.waitForFunction(() => document.getElementById('office-chat-status').textContent.includes('사용 한도'));
    const beforeRetry = aiCalls.length;
    await page.locator('#office-send-gemini').click();
    assert.equal(aiCalls.length,beforeRetry);
    await page.clock.fastForward(61000);
    await page.locator('#office-send-gemini').click();
    await page.waitForFunction(() => document.getElementById('office-history').textContent.includes('서버 Gemini 답변 3'));
    assert.equal(aiCalls.at(-1).requestId,aiCalls.at(-2).requestId);
    for(const [width,height] of [[320,740],[390,844],[768,1024],[960,600],[1440,900]]) {
      await page.setViewportSize({width,height});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const box = await page.locator('#employee-dialog').boundingBox();
      assert.ok(box.width <= width && box.height <= height);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'계정 연결됨',exact:true}).click();
    await page.locator('#office-email').fill('second@example.test');
    await page.locator('#office-password').fill('second-password');
    await page.locator('#office-login').getByRole('button',{name:'로그인',exact:true}).click();
    await page.locator('#account-dialog').waitFor({state:'hidden'});
    await page.waitForSelector('[aria-label="한유진 · AI 비서실장"]');
    await page.getByRole('button',{name:'한유진 · AI 비서실장'}).click();
    await page.waitForFunction(() => document.getElementById('office-history').textContent === '저장된 기록이 없습니다.');
    assert.equal(await page.locator('#office-selected-count').textContent(),'선택한 기록 0건');
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'로그아웃',exact:true}).click();
    assert.deepEqual(errors,[]);
    console.log('Passed direct Gemini chat, consent, automatic save, idempotent retry, quota waiting, memory edits, profile restore, legacy continuation, account isolation and five viewports');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exit(1);});
