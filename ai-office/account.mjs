import {SHARED_MODEL_URL, SHARED_MODEL_KEY} from '../robot-shared-config.mjs';
export const base = new URL(SHARED_MODEL_URL).origin;
let session = null;
let refreshing = null;
try { session = JSON.parse(sessionStorage.getItem('mydesk.office.session')); } catch {}
function keep(value) {
  session = value;
  try {
    if (value) sessionStorage.setItem('mydesk.office.session', JSON.stringify(value));
    else sessionStorage.removeItem('mydesk.office.session');
  } catch {}
}
async function request(path, options = {}, token) {
  const response = await fetch(base + path, {
    ...options,
    headers: {apikey: SHARED_MODEL_KEY, 'Content-Type': 'application/json',
      ...(token ? {Authorization: 'Bearer ' + token} : {}), ...options.headers},
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = Error(data?.message || data?.error_description || data?.error || '서버에 연결하지 못했습니다.');
    Object.assign(error,{status:response.status,code:data?.code,retryAt:data?.retryAt});
    throw error;
  }
  return data;
}
async function token() {
  if (!session) throw Error('먼저 로그인해 주세요.');
  if (session.expires_at * 1000 < Date.now() + 60000) {
    if (!refreshing) refreshing = request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({refresh_token: session.refresh_token}),
    }).then(value => {keep({...value, expires_at: Date.now()/1000 + value.expires_in});})
      .catch(error => {keep(null); throw error;}).finally(() => {refreshing = null;});
    await refreshing;
  }
  return session.access_token;
}
export const account = {
  current: () => session?.user || null,
  async login(email, password) {
    const value = await request('/auth/v1/token?grant_type=password', {
      method: 'POST', body: JSON.stringify({email, password}),
    });
    keep({...value, expires_at: Date.now()/1000 + value.expires_in});
  },
  async signup(email, password) {
    const value = await request('/auth/v1/signup', {
      method: 'POST', body: JSON.stringify({email, password}),
    });
    if (value.access_token) keep({...value, expires_at: Date.now()/1000 + value.expires_in});
    return !!value.access_token;
  },
  async logout() {
    try { await request('/auth/v1/logout', {method:'POST'}, await token()); }
    finally { keep(null); }
  },
  async list(employeeId, {offset = 0, memoriesOnly = false} = {}) {
    const query = new URLSearchParams({select:'*', order:'created_at.desc,id.desc', limit:'100', offset:String(offset)});
    if(employeeId) query.set('employee_id','eq.' + employeeId);
    if(memoriesOnly) query.set('kind','eq.memory');
    return request('/rest/v1/ai_office_records?' + query, {}, await token());
  },
  async save(employeeId, kind, content, id, details = {}) {
    const authorization = await token();
    return request('/rest/v1/ai_office_records?on_conflict=id', {
      method: 'POST', headers: {Prefer:'resolution=ignore-duplicates'},
      body: JSON.stringify({...details, id, user_id: session.user.id, employee_id:employeeId, kind, content}),
    }, authorization);
  },
  async editMemory(row, content) {
    const query = new URLSearchParams({id:'eq.' + row.id, kind:'eq.memory', revision:'eq.' + (row.revision || 1)});
    const updated = await request('/rest/v1/ai_office_records?' + query, {
      method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify({content}),
    }, await token());
    if(!updated?.length) throw Error('다른 화면에서 수정하거나 삭제한 기억입니다. 새로고침 후 다시 확인해 주세요.');
    return updated[0];
  },
  async profiles() {
    return request('/rest/v1/ai_office_profiles?select=employee_id,name,personality,tone', {}, await token());
  },
  async saveProfile(employeeId, profile) {
    const authorization = await token();
    return request('/rest/v1/ai_office_profiles?on_conflict=user_id,employee_id', {
      method:'POST', headers:{Prefer:'resolution=merge-duplicates'},
      body:JSON.stringify({...profile, user_id:session.user.id, employee_id:employeeId}),
    }, authorization);
  },
  async geminiStatus() {
    return request('/functions/v1/ai-office-chat');
  },
  async chat(body) {
    return request('/functions/v1/ai-office-chat',{method:'POST',body:JSON.stringify(body)},await token());
  },
  async jobs() {
    return request('/rest/v1/ai_office_gemini_jobs?select=id,employee_id,state,attempted_at,retry_at,error_code&order=attempted_at.desc&limit=30',{},await token());
  },
  async remove(id) {
    return request('/rest/v1/ai_office_records?id=eq.' + encodeURIComponent(id), {method:'DELETE'}, await token());
  },
};
