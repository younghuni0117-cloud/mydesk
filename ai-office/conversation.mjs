import { account } from './account.mjs';
import { employees } from './office-map.mjs';

const $ = id => document.getElementById(id);
let selected = null;
let generation = 0;
let pending = false;
let ready = false;
let requestId = null;
let requestText = null;

function status(message) { $('office-chat-status').textContent = message; }
function updateAccount() {
  $('office-account').textContent = account.current() ? '계정 연결됨' : '로그인';
  $('office-logout').hidden = !account.current();
}
function updateSend() {
  $('office-send-ai').disabled = pending || !ready || !$('office-ai-consent').checked;
}
function lock(value) {
  pending = value;
  for (const id of ['office-save-draft','office-save-memory','office-content','office-all-toggle']) $(id).disabled = value;
  updateSend();
}
async function load() {
  const version = ++generation;
  $('office-history').replaceChildren();
  ready = false;
  updateSend();
  if (!account.current()) { status('로그인하면 서버에 기록을 저장하고 다른 기기에서 이어볼 수 있습니다.'); return; }
  status('기록을 불러오는 중입니다.');
  try {
    const [rows, ai] = await Promise.all([
      account.list(selected === 'chief' && $('office-all-toggle').checked ? null : selected),
      account.aiStatus().catch(() => ({ready:false})),
    ]);
    if (version !== generation) return;
    ready = ai.ready === true;
    updateSend();
    status(ready ? 'OpenAI 연결됨 · 승인한 메시지만 전송합니다.' : '기록 저장 가능 · OpenAI 서버 키와 사용 한도 설정 대기');
    for (const row of rows) {
      const entry = document.createElement('article');
      entry.className = 'office-record';
      const meta = document.createElement('small');
      const kind = {draft:'상담 초안',memory:'기억',user:'보낸 메시지',assistant:'AI 응답'};
      meta.textContent = (employees.find(employee => employee.id === row.employee_id)?.name || '') + ' · ' + kind[row.kind] + ' · ' + new Date(row.created_at).toLocaleString('ko-KR');
      const content = document.createElement('p');
      content.textContent = row.content;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'office-button';
      remove.textContent = '삭제';
      remove.onclick = async () => {
        if (pending || !confirm('이 기록을 서버에서 삭제할까요?')) return;
        lock(true);
        try { await account.remove(row.id); await load(); }
        catch (error) { status(error.message); }
        finally { lock(false); }
      };
      entry.append(meta, content, remove);
      $('office-history').append(entry);
    }
    if (!rows.length) $('office-history').textContent = '저장된 기록이 없습니다.';
  } catch (error) { if(version === generation) status(error.message); }
  updateAccount();
}
export function openConversation(employeeId) {
  selected = employeeId;
  $('office-content').value = '';
  $('office-ai-consent').checked = false;
  $('office-all-toggle').checked = false;
  $('office-all-records').hidden = employeeId !== 'chief';
  requestId = requestText = null;
  load();
}
$('employee-dialog').addEventListener('cancel', event => { if(pending) event.preventDefault(); });
$('employee-dialog').querySelector('form[method=dialog]').addEventListener('submit', event => { if(pending) event.preventDefault(); });
$('office-account').onclick = () => $('account-dialog').showModal();
$('office-all-toggle').onchange = load;
$('office-ai-consent').onchange = updateSend;
async function authenticate(signup) {
  if (pending || !$('office-login').reportValidity()) return;
  lock(true);
  const buttons = [...$('account-dialog').querySelectorAll('button')];
  buttons.forEach(button => button.disabled = true);
  try {
    const args = [$('office-email').value.trim(), $('office-password').value];
    const connected = signup ? await account.signup(...args) : (await account.login(...args), true);
    $('office-password').value = '';
    updateAccount();
    if (connected) {
      $('account-dialog').close();
      if (selected) await load();
    } else $('account-message').textContent = '이메일에서 가입 확인을 마친 뒤 로그인해 주세요.';
  } catch (error) { $('account-message').textContent = error.message; }
  finally { buttons.forEach(button => button.disabled = false); lock(false); }
}
$('office-login').onsubmit = event => {event.preventDefault(); authenticate(false);};
$('office-signup').onclick = () => authenticate(true);
$('office-logout').onclick = async () => {
  if(pending) return;
  lock(true);
  try {await account.logout();}
  catch(error) {status(error.message);}
  finally {
    updateAccount();
    $('office-history').replaceChildren();
    if(selected) await load();
    lock(false);
  }
};
async function save(kind) {
  if(pending || !$('office-compose').reportValidity()) return;
  if(!account.current()) {$('account-dialog').showModal(); return;}
  const content = $('office-content').value.trim();
  if(!content) return;
  lock(true);
  try {
    await account.save(selected, kind, content, crypto.randomUUID());
    $('office-content').value = '';
    await load();
    status(kind === 'memory' ? '직원별 기억을 서버에 저장했습니다.' : '상담 초안을 서버에 저장했습니다. AI 응답은 생성하지 않았습니다.');
  } catch(error) {status(error.message);}
  finally {lock(false);}
}
$('office-compose').onsubmit = event => {event.preventDefault(); save('draft');};
$('office-save-memory').onclick = () => save('memory');
$('office-send-ai').onclick = async () => {
  if(pending || !ready || !$('office-ai-consent').checked || !$('office-compose').reportValidity()) return;
  const content = $('office-content').value.trim();
  if(!content) return;
  if(content !== requestText) {requestId = crypto.randomUUID(); requestText = content;}
  lock(true);
  status('OpenAI 응답을 기다리는 중입니다.');
  try {
    await account.chat(selected, content, requestId);
    $('office-content').value = '';
    requestId = requestText = null;
    await load();
  } catch(error) {status(error.message + ' 기록을 다시 확인한 후 재시도해 주세요.');}
  finally {lock(false);}
};
document.addEventListener('visibilitychange', () => {
  if(!document.hidden && selected && $('employee-dialog').open && !pending) load();
});
updateAccount();
