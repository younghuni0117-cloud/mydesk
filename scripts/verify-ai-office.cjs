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
    let failNextSave = false;
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
      if(url.pathname.includes('/functions/v1/') || url.hostname === 'api.openai.com') {
        aiCalls.push(url.pathname);
        return route.abort();
      }
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
          if(failNextSave) {failNextSave = false; return route.abort();}
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
    await page.getByRole('button',{name:'한유진 · AI 비서실장'}).click();
    await page.locator('#office-content').fill('로그인 전 상담');
    await page.getByRole('button',{name:'ChatGPT 상담문 만들기',exact:true}).click();
    assert.ok((await page.locator('#office-prompt').inputValue()).includes('로그인 전 상담'));
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'로그인',exact:true}).click();
    await page.locator('#office-email').fill('test@example.test');
    await page.locator('#office-password').fill('test-password');
    await page.locator('#office-login').getByRole('button',{name:'로그인',exact:true}).click();
    await page.locator('#account-dialog').waitFor({state:'hidden'});
    await page.getByRole('button',{name:'한유진 · AI 비서실장'}).click();
    await page.waitForFunction(() => document.getElementById('office-history').textContent.includes('기존에 저장한 단독 답변'));
    await page.locator('#office-content').fill('첫 질문');
    await page.getByRole('button',{name:'ChatGPT 상담문 만들기',exact:true}).click();
    assert.ok(!(await page.locator('#office-prompt').inputValue()).includes('간결한 보고 선호'));
    await page.locator('.office-record').filter({hasText:'간결한 보고 선호'}).getByRole('checkbox').check();
    await page.getByRole('button',{name:'ChatGPT 상담문 만들기',exact:true}).click();
    assert.ok((await page.locator('#office-prompt').inputValue()).includes('간결한 보고 선호'));
    await page.getByRole('button',{name:'기억 수정',exact:true}).click();
    await page.getByRole('textbox',{name:'기억 수정 내용'}).fill('표로 정리한 보고 선호');
    await page.getByRole('button',{name:'수정 저장',exact:true}).click();
    await page.waitForFunction(() => document.getElementById('office-history').textContent.includes('표로 정리한 보고 선호'));
    await page.locator('#office-answer').fill('첫 답변');
    failNextSave = true;
    await page.getByRole('button',{name:'질문·답변 함께 저장',exact:true}).click();
    await page.waitForFunction(() => !document.getElementById('office-save-answer').disabled);
    await page.getByRole('button',{name:'질문·답변 함께 저장',exact:true}).click();
    await page.waitForFunction(() => document.getElementById('office-history').textContent.includes('첫 답변'));
    assert.equal(rows.filter(row => row.kind === 'consultation').length,1);
    assert.equal(rows.find(row => row.kind === 'consultation').question,'첫 질문');
    const threadId = rows.find(row => row.kind === 'consultation').thread_id;
    await page.locator('#office-content').fill('두 번째 질문');
    await page.locator('#office-answer').fill('두 번째 답변');
    await page.getByRole('button',{name:'질문·답변 함께 저장',exact:true}).click();
    await page.waitForFunction(() => document.getElementById('office-history').textContent.includes('두 번째 답변'));
    assert.ok(rows.filter(row => row.kind === 'consultation').every(row => row.thread_id === threadId));
    await page.getByRole('button',{name:'새 상담 시작',exact:true}).click();
    await page.locator('.office-record').filter({hasText:'첫 답변'}).getByRole('button',{name:'이 상담 이어하기'}).click();
    await page.locator('#office-content').fill('이어서 세 번째 질문');
    await page.getByRole('button',{name:'ChatGPT 상담문 만들기',exact:true}).click();
    const prompt = await page.locator('#office-prompt').inputValue();
    for(const text of ['첫 질문','첫 답변','두 번째 질문','두 번째 답변','이어서 세 번째 질문']) assert.ok(prompt.includes(text),text);
    await page.getByRole('button',{name:'기억만 보기',exact:true}).click();
    await page.waitForFunction(() => document.querySelectorAll('.office-record').length === 1);
    staleMemory = true;
    await page.getByRole('button',{name:'기억 수정',exact:true}).click();
    await page.getByRole('textbox',{name:'기억 수정 내용'}).fill('다른 내용');
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
    await page.getByRole('button',{name:'ChatGPT 상담문 만들기',exact:true}).click();
    for(const text of ['민서','꼼꼼한 성격','짧고 명확한 존댓말']) assert.ok((await page.locator('#office-prompt').inputValue()).includes(text));
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForSelector('[aria-label="민서 · AI 비서실장"]');
    await page.getByRole('button',{name:'민서 · AI 비서실장'}).click();
    await page.waitForFunction(() => document.getElementById('office-history').textContent.includes('첫 답변'));
    await page.locator('.office-record').filter({hasText:'기존에 저장한 단독 답변'}).getByRole('button',{name:'이 상담 이어하기'}).click();
    await page.locator('#office-content').fill('이전 답변에 대해 다시 질문');
    await page.getByRole('button',{name:'ChatGPT 상담문 만들기',exact:true}).click();
    assert.ok((await page.locator('#office-prompt').inputValue()).includes('기존에 저장한 단독 답변'));
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
    assert.equal(await page.locator('#office-prompt').inputValue(),'');
    await page.getByRole('button',{name:'한유진 · AI 비서실장'}).click();
    await page.waitForFunction(() => document.getElementById('office-history').textContent === '저장된 기록이 없습니다.');
    assert.equal(await page.locator('#office-selected-count').textContent(),'선택한 기록 0건');
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'로그아웃',exact:true}).click();
    await page.waitForSelector('[aria-label="한유진 · AI 비서실장"]');
    assert.equal(await page.locator('#office-prompt').inputValue(),'');
    assert.deepEqual(errors,[]);
    assert.deepEqual(aiCalls,[]);
    console.log('Passed guest prompt, paired/retried saves, continuation, selected/edited memories, stale edit handling, profile persistence/reset, account switch cleanup, legacy records, five viewports, zero AI requests');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exit(1);});
