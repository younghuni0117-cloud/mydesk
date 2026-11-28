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
  if (!response.ok) throw Error(data?.message || data?.error_description || data?.error || '서버에 연결하지 못했습니다.');
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
  async list(employeeId) {
    return request('/rest/v1/ai_office_records?select=*&order=created_at.desc,id.desc&limit=100' +
      (employeeId ? '&employee_id=eq.' + encodeURIComponent(employeeId) : ''), {}, await token());
  },
  async save(employeeId, kind, content, id) {
    return request('/rest/v1/ai_office_records?on_conflict=id', {
      method: 'POST', headers: {Prefer:'resolution=ignore-duplicates'},
      body: JSON.stringify({id, user_id: session?.user.id, employee_id:employeeId, kind, content}),
    }, await token());
  },
  async remove(id) {
    return request('/rest/v1/ai_office_records?id=eq.' + encodeURIComponent(id), {method:'DELETE'}, await token());
  },
  async aiStatus() {
    return request('/functions/v1/ai-office-chat', {}, await token());
  },
  async chat(employeeId, content, id, signal) {
    return request('/functions/v1/ai-office-chat', {method:'POST',signal,
      body:JSON.stringify({employeeId, content, requestId:id, approved:true})}, await token());
  },
};
