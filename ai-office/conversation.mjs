import { account } from './account.mjs?v=gemini1';
import { employees } from './office-map.mjs';

const $ = id => document.getElementById(id);
const defaults = employees.map(employee => ({...employee}));
const selectedRecords = new Map();
const kindLabels = {
  draft:'상담 초안', memory:'기억', user:'보낸 메시지', assistant:'AI 응답',
  chatgpt:'ChatGPT 답변 · 직접 저장', consultation:'질문·답변 · ChatGPT에서 직접 저장', gemini:'Gemini 상담 · 서버 응답',
};
let selected = null;
let generation = 0;
let pending = false;
let loadedRecords = [];
let memoriesOnly = false;
let threadId = null;
let threadTitle = '';
let hasMore = false;
let saveAttempt = null;
let chatAttempt = null;
let geminiReady = false;
let retryAt = 0;

function status(message) { $('office-chat-status').textContent = message; }
function updateAccount() {
  $('office-account').textContent = account.current() ? '계정 연결됨' : '로그인';
  $('office-logout').hidden = !account.current();
}
function lock(value) {
  pending = value;
  for (const button of $('employee-dialog').querySelectorAll('button, input, textarea')) button.disabled = value;
}
function updateSelection() {
  $('office-gemini-consent').checked = false;
  $('office-selected-count').textContent = '선택한 기록 ' + selectedRecords.size + '건';
}
function updateThread() {
  $('office-thread-status').textContent = threadId ? '상담 이어가기 · ' + threadTitle : '새 상담';
}
function fillProfile() {
  const employee = employees.find(item => item.id === selected);
  if(!employee) return;
  $('office-profile-name').value = employee.name;
  $('office-profile-personality').value = employee.personality || employee.style;
  $('office-profile-tone').value = employee.tone || employee.style;
}
function applyProfiles(rows = []) {
  for(const employee of employees) {
    const original = defaults.find(item => item.id === employee.id);
    const profile = rows.find(row => row.employee_id === employee.id);
    Object.assign(employee, {
      name:profile?.name || original.name,
      personality:profile?.personality || original.style,
      tone:profile?.tone || original.style,
    });
  }
  window.dispatchEvent(new Event('office-profiles-updated'));
  fillProfile();
}
async function refreshProfiles() {
  const userId = account.current()?.id;
  if(!userId) {applyProfiles(); return;}
  const profiles = await account.profiles();
  if(account.current()?.id === userId) applyProfiles(profiles);
}
function recordText(row) {
  return row.question ? '질문\n' + row.question + '\n답변\n' + row.content : row.content;
}
function selectRecord(row, checked) {
  if(checked) selectedRecords.set(row.id, row);
  else selectedRecords.delete(row.id);
  updateSelection();
}
async function continueFrom(row) {
  if(pending) return;
  threadId = row.employee_id === selected && row.thread_id ? row.thread_id : crypto.randomUUID();
  threadTitle = (row.question || row.content).slice(0,40);
  const matches = loadedRecords.filter(item => item.thread_id && item.thread_id === row.thread_id && item.employee_id === row.employee_id);
  for(const item of matches.length ? matches : [row]) selectedRecords.set(item.id,item);
  updateSelection();
  updateThread();
  renderRecords();
  $('office-content').value = '';
  $('office-content').focus();
  status('이 상담의 불러온 기록을 선택했습니다. 내용을 확인하고 이어서 질문하세요.');
}
function startMemoryEdit(row, entry) {
  if(pending || entry.querySelector('textarea')) return;
  const editor = document.createElement('textarea');
  editor.className = 'office-memory-editor';
  editor.maxLength = 12000;
  editor.value = row.content;
  editor.setAttribute('aria-label','기억 수정 내용');
  const saveButton = button('수정 저장', async () => {
    const content = editor.value.trim();
    if(!content || pending) return;
    lock(true);
    ++generation;
    try {
      const updated = await account.editMemory(row,content);
      Object.assign(row,updated);
      if(selectedRecords.has(row.id)) selectedRecords.set(row.id,row);
      renderRecords();
      status('기억을 수정했습니다.');
    } catch(error) {status(error.message);}
    finally {lock(false);}
  });
  const cancelButton = button('수정 취소', renderRecords);
  entry.append(editor,saveButton,cancelButton);
  editor.focus();
}
function button(text, onClick) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'office-button';
  element.textContent = text;
  element.onclick = onClick;
  return element;
}
function renderRecords() {
  const history = $('office-history');
  history.replaceChildren();
  for(const row of loadedRecords) {
    const entry = document.createElement('article');
    entry.className = 'office-record';
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedRecords.has(row.id);
    checkbox.onchange = () => selectRecord(row,checkbox.checked);
    const name = employees.find(item => item.id === row.employee_id)?.name || row.employee_id;
    label.append(checkbox, document.createTextNode('Gemini에 전달 · ' + name + ' · ' + kindLabels[row.kind]));
    const meta = document.createElement('small');
    meta.textContent = new Date(row.created_at).toLocaleString('ko-KR');
    const content = document.createElement('p');
    content.textContent = recordText(row);
    const actions = document.createElement('div');
    actions.className = 'office-scenes';
    if(row.source_model) meta.textContent += ' · ' + row.source_model;
    if(row.kind === 'memory') {
      actions.append(button('기억 수정', () => startMemoryEdit(row,entry)));
    } else {
      actions.append(button('이 상담 이어하기', () => continueFrom(row)));
    }
    actions.append(button('삭제', async () => {
      if(pending || !confirm('이 기록을 서버에서 삭제할까요?')) return;
      lock(true);
      ++generation;
      try {
        await account.remove(row.id);
        selectedRecords.delete(row.id);
        updateSelection();
        await load();
      } catch(error) {status(error.message);}
      finally {lock(false);}
    }));
    entry.append(label,meta,content,actions);
    history.append(entry);
  }
  if(!loadedRecords.length) history.textContent = '저장된 기록이 없습니다.';
  $('office-more').hidden = !hasMore;
}
async function load(append = false) {
  const version = ++generation;
  if(!append) loadedRecords = [];
  if(!account.current()) {
    hasMore = false;
    renderRecords();
    status('로그인하면 Gemini에게 질문하고 상담과 직원 설정을 저장할 수 있습니다.');
    return;
  }
  status('기록을 불러오는 중입니다.');
  const employeeId = selected === 'chief' && $('office-all-toggle').checked ? null : selected;
  try {
    const rows = await account.list(employeeId, {
      offset:append ? loadedRecords.length : 0, memoriesOnly,
    });
    if(version !== generation) return;
    hasMore = rows.length === 100;
    const byId = new Map((append ? loadedRecords : []).map(row => [row.id,row]));
    for(const row of rows) {
      byId.set(row.id,row);
      if(selectedRecords.has(row.id)) selectedRecords.set(row.id,row);
    }
    loadedRecords = [...byId.values()];
    renderRecords();
    status('필요한 기록을 선택하고 Gemini에게 질문하세요. 질문과 답변은 자동으로 저장됩니다.');
  } catch(error) {
    if(version === generation) {renderRecords(); status(error.message);}
  }
  updateAccount();
}
export function openConversation(employeeId) {
  selected = employeeId;
  $('office-content').value = '';
  $('office-all-toggle').checked = false;
  $('office-all-records').hidden = employeeId !== 'chief';
  $('office-profile').open = false;
  memoriesOnly = false;
  $('office-memories').setAttribute('aria-pressed','false');
  selectedRecords.clear();
  threadId = null;
  threadTitle = '';
  saveAttempt = null;
  chatAttempt = null;
  $('office-gemini-consent').checked = false;
  updateSelection();
  updateThread();
  fillProfile();
  load();
}
$('employee-dialog').addEventListener('cancel', event => {if(pending) event.preventDefault();});
$('employee-dialog').querySelector('form[method=dialog]').addEventListener('submit', event => {if(pending) event.preventDefault();});
$('office-account').onclick = () => $('account-dialog').showModal();
$('office-all-toggle').onchange = () => {
  if(pending) return;
  selectedRecords.clear();
  updateSelection();
  load();
};
$('office-refresh').onclick = async () => {
  if(pending) return;
  selectedRecords.clear();
  updateSelection();
  await load();
  try {await Promise.all([refreshProfiles(),refreshJobs(),refreshGeminiStatus()]);} catch(error) {status(error.message);}
};
$('office-more').onclick = () => {if(!pending) load(true);};
$('office-memories').onclick = () => {
  if(pending) return;
  memoriesOnly = !memoriesOnly;
  $('office-memories').setAttribute('aria-pressed',String(memoriesOnly));
  load();
};
$('office-clear-selection').onclick = () => {
  if(pending) return;
  selectedRecords.clear();
  updateSelection();
  renderRecords();
};
$('office-new-thread').onclick = () => {
  if(pending) return;
  if($('office-content').value && !confirm('입력 중인 내용을 비우고 새 상담을 시작할까요?')) return;
  threadId = null;
  threadTitle = '';
  selectedRecords.clear();
  $('office-content').value = '';
  saveAttempt = null;
  chatAttempt = null;
  $('office-gemini-consent').checked = false;
  updateThread();
  updateSelection();
  renderRecords();
};
$('office-content').addEventListener('input', () => {
  $('office-gemini-consent').checked = false;
  $('office-send-gemini').textContent = 'Gemini에게 질문하기';
});
async function authenticate(signup) {
  if(pending || !$('office-login').reportValidity()) return;
  lock(true);
  const buttons = [...$('account-dialog').querySelectorAll('button')];
  buttons.forEach(item => item.disabled = true);
  try {
    const previousUser = account.current()?.id;
    const args = [$('office-email').value.trim(), $('office-password').value];
    const connected = signup ? await account.signup(...args) : (await account.login(...args),true);
    $('office-password').value = '';
    updateAccount();
    if(connected) {
      if(previousUser && previousUser !== account.current()?.id) {
        ++generation;
        selectedRecords.clear();
        loadedRecords = [];
        threadId = null;
        threadTitle = '';
        saveAttempt = null;
        chatAttempt = null;
        $('office-content').value = '';
        updateSelection();
        updateThread();
        renderRecords();
        applyProfiles();
      }
      $('account-dialog').close();
      await refreshProfiles();
      await refreshJobs();
      if(selected) await load();
    } else $('account-message').textContent = '이메일에서 가입 확인을 마친 뒤 로그인해 주세요.';
  } catch(error) {$('account-message').textContent = error.message;}
  finally {buttons.forEach(item => item.disabled = false); lock(false);}
}
$('office-login').onsubmit = event => {event.preventDefault(); authenticate(false);};
$('office-signup').onclick = () => authenticate(true);
$('office-logout').onclick = async () => {
  if(pending) return;
  lock(true);
  try {await account.logout();}
  catch(error) {status(error.message);}
  finally {
    ++generation;
    updateAccount();
    applyProfiles();
    selectedRecords.clear();
    loadedRecords = [];
    chatAttempt = null;
    window.dispatchEvent(new CustomEvent('office-ai-status',{detail:[]}));
    $('office-gemini-consent').checked = false;
    $('office-content').value = '';
    threadId = null;
    updateThread();
    updateSelection();
    if(selected) await load();
    lock(false);
  }
};
async function save(kind) {
  if(pending || !$('office-compose').reportValidity()) return;
  if(!account.current()) {$('account-dialog').showModal(); return;}
  const content = $('office-content').value.trim();
  if(!content) return;
  const fingerprint = JSON.stringify([selected,kind,content]);
  if(saveAttempt?.fingerprint !== fingerprint) saveAttempt = {fingerprint,id:crypto.randomUUID()};
  lock(true);
  ++generation;
  try {
    await account.save(selected,kind,content,saveAttempt.id);
    $('office-content').value = '';
    saveAttempt = null;
    await load();
    status(kind === 'memory' ? '직원별 기억을 서버에 저장했습니다.' : '상담 초안을 서버에 저장했습니다.');
  } catch(error) {status(error.message);}
  finally {lock(false);}
}
$('office-compose').onsubmit = event => {event.preventDefault(); sendGemini();};
$('office-save-draft').onclick = () => save('draft');
$('office-save-memory').onclick = () => save('memory');
$('office-profile-form').onsubmit = async event => {
  event.preventDefault();
  if(pending || !$('office-profile-form').reportValidity()) return;
  if(!account.current()) {$('account-dialog').showModal(); return;}
  const profile = {
    name:$('office-profile-name').value.trim(),
    personality:$('office-profile-personality').value.trim(),
    tone:$('office-profile-tone').value.trim(),
  };
  if(Object.values(profile).some(value => !value)) return;
  lock(true);
  try {
    await account.saveProfile(selected,profile);
    await refreshProfiles();
    renderRecords();
    status('직원 설정을 저장했습니다. 이름과 Gemini 상담에 반영됩니다.');
  } catch(error) {status(error.message);}
  finally {lock(false);}
};

async function refreshGeminiStatus() {
  try {
    const state = await account.geminiStatus();
    geminiReady = state.ready === true;
    $('office-gemini-status').textContent = state.message + ' · ' + state.model;
  } catch {
    geminiReady = false;
    $('office-gemini-status').textContent = 'Gemini 서버 연결을 확인하지 못했습니다. 기록 새로고침을 눌러 주세요.';
  }
}
async function refreshJobs() {
  const userId = account.current()?.id;
  if(!userId) return;
  const jobs = await account.jobs();
  if(account.current()?.id !== userId) return;
  window.dispatchEvent(new CustomEvent('office-ai-status',{detail:jobs}));
}
async function sendGemini() {
  if(pending || !$('office-compose').reportValidity()) return;
  if(!account.current()) {$('account-dialog').showModal(); return;}
  if(!$('office-gemini-consent').checked) {
    status('질문과 선택한 기록에 개인정보·건강기록·기밀이 없는지 확인하고 전송 동의를 체크해 주세요.');
    $('office-gemini-consent').focus();
    return;
  }
  if(!geminiReady) {await refreshGeminiStatus(); if(pending || !geminiReady) return;}
  if(Date.now() < retryAt) {
    status('사용 한도 대기 중입니다. ' + new Date(retryAt).toLocaleString('ko-KR') + ' 이후 다시 보내 주세요.');
    return;
  }
  const question = $('office-content').value.trim();
  if(!question) return;
  const recordIds = [...selectedRecords.keys()].sort();
  if(recordIds.length>30) {status('한 번에 최대 30건의 기록을 선택해 주세요.'); return;}
  const fingerprint = JSON.stringify([selected,threadId,question,recordIds]);
  if(chatAttempt?.fingerprint !== fingerprint || chatAttempt.newRequestAllowed) {
    chatAttempt = {
      fingerprint,requestId:crypto.randomUUID(),employeeId:selected,
      threadId:threadId || crypto.randomUUID(),question,recordIds,consent:true,
    };
  }
  lock(true);
  ++generation;
  status('Gemini 응답을 기다리는 중입니다. 질문과 답변은 서버에서 저장합니다.');
  try {
    const {record} = await account.chat({
      requestId:chatAttempt.requestId,employeeId:chatAttempt.employeeId,threadId:chatAttempt.threadId,
      question:chatAttempt.question,recordIds:chatAttempt.recordIds,consent:true,
    });
    threadId = record.thread_id;
    threadTitle = threadTitle || record.question.slice(0,40);
    selectedRecords.set(record.id,record);
    $('office-content').value = '';
    $('office-gemini-consent').checked = false;
    chatAttempt = null;
    updateThread();
    updateSelection();
    memoriesOnly = false;
    $('office-memories').setAttribute('aria-pressed','false');
    await load();
    $('office-history').scrollTop = 0;
    status('Gemini 답변을 저장했습니다. 같은 상담에서 다음 질문을 이어갈 수 있습니다.');
  } catch(error) {
    if(error.retryAt) retryAt = Date.parse(error.retryAt) || Date.now()+60000;
    if(['failed','retry_limit','blocked','deleted'].includes(error.code)) {
      chatAttempt.newRequestAllowed = true;
      $('office-send-gemini').textContent = '새 요청으로 다시 보내기';
    } else {
      $('office-send-gemini').textContent = '처리 결과 확인·재시도';
    }
    status(error.message + (error.retryAt ? ' 대기 해제 예정 ' + new Date(retryAt).toLocaleString('ko-KR') : ''));
  } finally {
    lock(false);
    refreshJobs().catch(()=>{});
  }
}
updateAccount();
refreshGeminiStatus();
refreshProfiles().catch(error => status(error.message));
refreshJobs().catch(()=>{});
setInterval(() => {
  if(!document.hidden && account.current() && $('employee-dialog').open) refreshJobs().catch(()=>{});
},5000);
