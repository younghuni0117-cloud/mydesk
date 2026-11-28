import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, GEMINI_MODEL } from '../supabase/functions/ai-office-chat/handler.mjs';

const user = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const threadId = '30000000-0000-4000-8000-000000000001';
const memoryId = '40000000-0000-4000-8000-000000000001';
const body = {requestId,threadId,employeeId:'chief',question:'일반적인 회의 준비 순서를 알려줘',recordIds:[],consent:true};
function fixture({key = 'test-only-key', quota = false, blocked = false, foreignRecord = false, saveLostResponse = false} = {}) {
  const jobs = new Map();
  const records = [];
  const calls = [];
  let modelCalls = 0;
  let sentPrompt;
  const env = name => ({
    SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'test-service',GEMINI_API_KEY:key,
  })[name];
  const json = (value,status = 200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  const send = async (address,options = {}) => {
    calls.push(address);
    const url = new URL(address);
    const data = options.body ? JSON.parse(options.body) : null;
    if(url.pathname === '/auth/v1/user') return json(options.headers.Authorization === 'Bearer valid' ? {id:user} : {},options.headers.Authorization === 'Bearer valid' ? 200 : 401);
    if(url.hostname === 'generativelanguage.googleapis.com') {
      modelCalls++;
      assert.equal(options.headers['x-goog-api-key'],'test-only-key');
      assert.ok(address.endsWith('/'+GEMINI_MODEL+':generateContent'));
      sentPrompt = data;
      if(quota) return json({error:{details:[{retryDelay:'120s'}]}},429);
      if(blocked) return json({promptFeedback:{blockReason:'SAFETY'}});
      return json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'hidden thought'},{text:'회의 목적과 참석자를 먼저 정리하세요.'}]}}],usageMetadata:{promptTokenCount:50,candidatesTokenCount:20}});
    }
    if(url.pathname.endsWith('/ai_office_profiles')) return json([{name:'민서',personality:'꼼꼼함',tone:'간결한 존댓말'}]);
    if(url.pathname.endsWith('/ai_office_records')) {
      if(url.searchParams.has('id') && url.searchParams.get('id').startsWith('in.'))
        return json(foreignRecord ? [] : [{id:memoryId,employee_id:'chief',kind:'memory',content:'공개 발표 자료를 준비합니다.'}]);
      return json(records.filter(record => 'eq.'+record.id === url.searchParams.get('id')));
    }
    if(url.pathname.endsWith('/ai_office_gemini_jobs')) {
      const job = jobs.get(url.searchParams.get('id')?.slice(3));
      if(options.method === 'PATCH') {Object.assign(job,data,{new_attempt:false}); return new Response(null,{status:204});}
      return json(job ? [job] : []);
    }
    if(url.pathname.endsWith('/rpc/ai_office_gemini_reserve')) {
      if(jobs.has(data.p_id)) return json(jobs.get(data.p_id));
      const job = {id:data.p_id,user_id:data.p_user,employee_id:data.p_employee,
        question:data.p_question,thread_id:data.p_thread,request_hash:data.p_hash,
        model:data.p_model,state:'running',attempts:1,new_attempt:true};
      jobs.set(job.id,job);
      return json(job);
    }
    if(url.pathname.endsWith('/rpc/ai_office_gemini_finish')) {
      const job = jobs.get(data.p_id);
      const record = {id:job.id,user_id:job.user_id,employee_id:job.employee_id,
        question:job.question,thread_id:job.thread_id,content:data.p_answer,kind:'gemini',source_model:job.model};
      records.push(record);
      Object.assign(job,{state:'complete',record_id:record.id,new_attempt:false});
      if(saveLostResponse) return json({message:'response lost'},500);
      return json(record);
    }
    if(url.pathname.endsWith('/rpc/ai_office_gemini_pause')) {
      Object.assign(jobs.get(data.p_id),{state:'rate_limited',retry_at:new Date(Date.now()+data.p_seconds*1000).toISOString(),new_attempt:false});
      return json(null);
    }
    throw Error('Unexpected request '+address);
  };
  const handler = createHandler({env,fetch:send});
  const invoke = (data = body, token = 'valid') => handler(new Request('https://edge.test',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(data),
  }));
  return {handler,invoke,jobs,records,calls,get modelCalls(){return modelCalls;},get sentPrompt(){return sentPrompt;}};
}
test('missing configuration and unauthenticated requests never invoke Gemini',async () => {
  const app = fixture({key:''});
  const status = await app.handler(new Request('https://edge.test'));
  assert.equal((await status.json()).ready,false);
  assert.equal((await app.invoke()).status,503);
  assert.equal((await app.invoke(body,'invalid')).status,401);
  assert.equal(app.modelCalls,0);
});
test('real response is saved once and a repeated request reuses it',async () => {
  const app = fixture();
  const first = await app.invoke();
  assert.equal(first.status,200);
  const saved = (await first.json()).record;
  assert.equal(saved.kind,'gemini');
  assert.equal(saved.question,body.question);
  assert.equal(saved.content,'회의 목적과 참석자를 먼저 정리하세요.');
  assert.ok(app.sentPrompt.systemInstruction.parts[0].text.includes('민서'));
  assert.equal((await app.invoke()).status,200);
  assert.equal(app.modelCalls,1);
  assert.equal(app.records.length,1);
  assert.equal((await app.invoke({...body,question:'changed'})).status,409);
  assert.equal(app.modelCalls,1);
});
test('selection is reauthorized on the server and consent is required',async () => {
  const app = fixture({foreignRecord:true});
  assert.equal((await app.invoke({...body,consent:false})).status,400);
  assert.equal((await app.invoke({...body,recordIds:[memoryId]})).status,409);
  assert.equal(app.modelCalls,0);
});
test('quota pauses the job and a second request never falls back to another model',async () => {
  const app = fixture({quota:true});
  const first = await app.invoke();
  assert.equal(first.status,429);
  assert.ok((await first.json()).retryAt);
  assert.equal((await app.invoke()).status,429);
  assert.equal(app.modelCalls,1);
  assert.equal(app.records.length,0);
});
test('blocked output is a failure and creates no fabricated answer',async () => {
  const app = fixture({blocked:true});
  assert.equal((await app.invoke()).status,502);
  assert.equal(app.jobs.get(requestId).state,'failed');
  assert.equal(app.records.length,0);
  assert.equal((await app.invoke()).status,409);
  assert.equal(app.modelCalls,1);
});
test('a lost completion response recovers the committed answer without another call',async () => {
  const app = fixture({saveLostResponse:true});
  const result = await app.invoke();
  assert.equal(result.status,200);
  assert.equal((await result.json()).record.kind,'gemini');
  assert.equal(app.modelCalls,1);
  assert.equal(app.records.length,1);
});
test('only selected owned records are included, with no hidden chain of thought',async () => {
  const app = fixture();
  const result = await app.invoke({...body,recordIds:[memoryId]});
  assert.equal(result.status,200);
  assert.ok(app.sentPrompt.contents[0].parts[0].text.includes('공개 발표 자료'));
  assert.ok(!(await result.json()).record.content.includes('hidden thought'));
});
