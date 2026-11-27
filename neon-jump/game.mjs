import { DECISION_STEPS, initialState, levelKey, loadLevels, observe, progress, step, STEP } from './physics.mjs?v=3';
import { forward, greedy } from './dqn.mjs';
import { compatible, makeReplay } from './training.mjs?v=3';
import { drawChart, render } from './render.mjs?v=3';
import { enableAudio, playJump } from './sound.mjs';
import { put, read, saveManual } from './storage.mjs';

const $ = id => document.getElementById(id);
const canvas = $('course');
let worker;
try { worker = new Worker(new URL('./worker.mjs?v=3', import.meta.url), { type: 'module' }); }
catch { /* Manual play can run without a Worker. */ }
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(pointer: coarse)');
const percent = value => value == null ? '—' : (100 * value).toFixed(1) + '%';
const number = value => value == null ? '—' : value.toFixed(3);
let levels, level, state, previousState, ai, user, policy, previewPolicy, replay, lastReplay, watchingBest;
let sound = true, previewAttempt = 0, chartReport;
let mode = 'manual', activity = 'ready', resumeActivity, pendingActivity;
let epoch = 0, pendingLevel, actions = [], replayIndex = 0, jump = false, q, selectedAction;
let lastFrame, elapsed = 0, crashAge = 0, cooldown = 0, clock = 0;
let budget = mobile.matches ? 5 : 10, nextBudgetAt = 0, slowFrames = 0, frameCount = 0;
let eventKey = '', renderedState, renderedActivity;

function send(type, data = {}) { worker?.postMessage({ type, epoch, ...data }); }
function notice(message = '') {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}
function status(message) {
  if ($('status').textContent !== message) $('status').textContent = message;
}
function setPairs(element, rows) {
  const nodes = [];
  for (const [label, value] of rows) {
    const term = document.createElement('dt'), detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    nodes.push(term, detail);
  }
  element.replaceChildren(...nodes);
}
function comparison() {
  setPairs($('comparison'), [
    ['내 최고 진행률', percent(user?.best)], ['내 완료한 시도', user?.attempts ?? 0],
    ['내 클리어', user?.cleared ? '성공' : '—'], ['내 통과 장애물', user?.passed ?? 0],
    ['AI 최고 진행률', percent(ai?.maximum)], ['AI 학습 에피소드', ai?.episode ?? 0],
    ['AI 학습 중 클리어', ai?.cleared ? '성공' : '—'], ['AI 통과 장애물', ai?.mostPassed ?? 0]
  ]);
  $('manual-replay').disabled = !compatible(level, user?.replay);
}
function diagnostics() {
  if (!ai) return;
  const watching = ['training', 'observe'].includes(activity);
  const shownQ = watching ? q : ai.q;
  $('episode').textContent = ai.episode.toLocaleString();
  $('best-progress').textContent = percent(ai.maximum);
  $('average-progress').textContent = percent(ai.average);
  const goal = ai.runTarget - ai.runStart;
  const completed = Math.max(0, ai.episode - ai.runStart);
  $('training-progress').value = goal ? Math.min(1, completed / goal) : 0;
  $('training-count').textContent = (goal ? completed.toLocaleString() + ' / ' + goal.toLocaleString() : '—');
  setPairs($('metrics'), [
    ['에피소드', ai.episode], ['최근 20회 평균', percent(ai.average)], ['평가 최고 정책', percent(ai.best)],
    ['탐색률 ε', percent(ai.epsilon)], ['손실', number(ai.loss)],
    ['Q(대기)', number(shownQ?.[0])], ['Q(점프)', number(shownQ?.[1])],
    ['선택 행동', watching && selectedAction !== undefined ? (selectedAction ? '점프' : '대기') : '—'],
    ['가중치 갱신', ai.updates], ['경험 버퍼', ai.replaySize + ' / ' + ai.capacity],
    ['에피소드/초', activity === 'training' ? ai.episodeRate.toFixed(1) : '—'],
    ['Worker 처리 시간', activity === 'training' ? ai.compute.toFixed(1) + ' ms' : '—']
  ]);
  if (chartReport !== ai && mode === 'ai') {
    chartReport = ai;
    $('chart-label').textContent = drawChart($('chart'), ai.history);
  }
  $('evaluation').textContent = ai.evaluation
    ? '고정 조건 · ' + percent(ai.evaluation.fixed) + ' / 시작점 변화 · '
      + ai.evaluation.robustness.map(row => row.offset + ' px ' + percent(row.progress)).join(' · ')
    : '고정 조건 및 시작점 변화 평가 기록이 없습니다.';
  const key = epoch + ':' + ai.events.length;
  if (key !== eventKey) {
    eventKey = key;
    $('events').replaceChildren(...ai.events.slice(-100).reverse().map(event => {
      const row = document.createElement('li'), button = document.createElement('button');
      button.className = 'secondary';
      button.textContent = event.episode + '회 · ' + event.kind + ' · ' + percent(event.progress);
      button.title = new Date(event.time).toLocaleString() + ' / 정책 ' + event.policyVersion + ' / 스테이지 ' + event.stageVersion;
      button.onclick = () => send('replay', { index: event.index });
      row.append(button);
      if (event.diagnostic) {
        const details = document.createElement('p');
        const d = event.diagnostic;
        details.textContent = '탐색률 ' + percent(d.epsilon) + ' · 손실 ' + number(d.loss) + ' · 갱신 '
          + d.updates + '회 · 경험 ' + d.replay + '개 · 점프 ' + d.jumps + '개 · 종료 '
          + d.terminals + '개 · 평균 ' + d.averages.map(percent).join(' → ') + ' · 충돌 '
          + Object.entries(d.hits).map(([i, count]) => '#' + i + ' ' + count + '회').join(', ');
        row.append(details);
      }
      return row;
    }));
  }
}
function refresh() {
  $('manual').setAttribute('aria-pressed', mode === 'manual');
  $('ai').setAttribute('aria-pressed', mode === 'ai');
  $('ai').disabled = !worker;
  for (const id of ['ai-panel', 'ai-chart', 'live-stats', 'run-meter']) $(id).hidden = mode !== 'ai';
  $('count').disabled = activity === 'training' || (activity === 'paused' && resumeActivity === 'training');
  $('playback-mode').textContent = activity === 'training' ? '정책 미리보기 · 1배속' : activity === 'observe' ? '정책 관찰 · 1배속' : '';
  $('sound').setAttribute('aria-pressed', String(sound));
  $('controls-help').hidden = mode !== 'manual';
  $('level').disabled = !!pendingLevel;
  $('train').disabled = !ai || pendingActivity === 'training';
  $('train').textContent = activity === 'training' ? '학습 일시정지' : ai?.trained ? '추가 학습' : '학습 시작';
  $('observe').disabled = !ai || activity === 'observe' || pendingActivity === 'observe';
  $('best').disabled = ai?.best == null || pendingActivity === 'observe';
  $('benchmark').disabled = !ai;
  $('transfer').disabled = !ai || !!ai.replaySize || ai.best != null || !$('transfer-source').value || activity === 'training';
  $('reset').disabled = !ai;
  $('open-checkpoint').hidden = !ai?.hasConflict;
  $('open-checkpoint').textContent = ai?.onConflictBranch ? '기본 체크포인트 열기' : '충돌 사본 열기';
  $('compare').disabled = !lastReplay || ai?.best == null;
  $('pause').disabled = !['manual', 'observe', 'training', 'replay', 'paused'].includes(activity);
  const pauseLabel = activity === 'paused' ? '계속' : '일시정지';
  $('pause').textContent = activity === 'paused' ? '▶' : 'Ⅱ';
  $('pause').setAttribute('aria-label', pauseLabel);
  $('pause').title = pauseLabel;
  const show = ['ready', 'paused', 'cleared', 'replay-finished'].includes(activity);
  $('overlay').hidden = !show;
  $('overlay-title').textContent = ({ ready: level?.name ?? 'Neon Jump', paused: '일시정지',
    cleared: '스테이지 클리어', 'replay-finished': '재현 종료' })[activity] ?? '';
  $('overlay-action').disabled = !level || !!pendingLevel || (mode === 'ai' && !ai);
  $('overlay-action').textContent = activity === 'paused' ? '계속'
    : activity === 'replay-finished' ? '다시 재생' : mode === 'ai' ? (ai?.trained ? '최고 정책 보기' : '학습 시작')
      : activity === 'cleared' ? '다시 시작' : '시작';
  comparison();
  diagnostics();
}
function start(activityName, offset = 0) {
  activity = activityName;
  state = initialState(level, offset);
  previousState = { ...state };
  jump = false;
  actions = [];
  replayIndex = 0;
  elapsed = 0;
  crashAge = 0;
  cooldown = 0;
  q = null;
  selectedAction = undefined;
  refresh();
}
function ready() {
  start('ready');
  status(mode === 'manual' ? '직접 플레이를 시작하세요.' : '학습이나 실시간 관찰을 선택하세요.');
}
function manualKey(currentLevel) { return 'manual:' + currentLevel.id + ':' + currentLevel.version; }
async function loadManual(currentLevel) {
  try {
    const record = await read(manualKey(currentLevel));
    if (level === currentLevel) { user = record; comparison(); }
  } catch { notice('브라우저에서 수동 기록을 읽을 수 없습니다.'); }
}
function saveSettings() {
  if (level) put('settings', { level: levelKey(level), mode, sound, courseVersion: 3, count: $('count').value }).catch(() => notice('설정을 저장할 수 없습니다.'));
}
function loadLevel(target) {
  if (pendingLevel) return;
  pendingLevel = { target, epoch: epoch + 1 };
  $('level').value = levelKey(target);
  $('level').disabled = true;
  if (worker) worker.postMessage({ type: 'load', level: levelKey(target), epoch: pendingLevel.epoch });
  else finishLoad(null);
}
function switchMode(target) {
  if (!level || mode === target || (target === 'ai' && !worker)) return;
  send('pause');
  pendingActivity = null;
  mode = target;
  ready();
  saveSettings();
}
function train(resume = false) {
  if (!ai || pendingLevel) return;
  if (activity === 'training') { pause(); return; }
  if (!$('count').reportValidity()) return;
  if (sound) enableAudio();
  if (!resume) {
    policy = previewPolicy = null;
    previewAttempt = 1;
    start('training');
  }
  pendingActivity = 'training';
  activity = 'training';
  status('학습 중');
  send('budget', { ms: budget });
  send('train', { resume, count: $('count').valueAsNumber });
  refresh();
}
function observePolicy(best = false) {
  if (!ai || pendingLevel) return;
  if (sound) enableAudio();
  pendingActivity = 'observe';
  watchingBest = best;
  send('observe', { best });
  refresh();
}
function pause() {
  if (activity === 'paused') {
    if (resumeActivity === 'training') { train(true); return; }
    activity = resumeActivity;
    elapsed = 0;
    status(activity === 'manual' ? '플레이 중' : '재생 중');
  } else if (['manual', 'observe', 'training', 'replay'].includes(activity)) {
    resumeActivity = activity;
    activity = 'paused';
    pendingActivity = null;
    send('pause');
    status('일시정지');
  }
  refresh();
}
function replayRun(record) {
  if (sound) enableAudio();
  if (!compatible(level, record)) { notice('이 스테이지 버전에서 재생할 수 없는 기록입니다.'); return; }
  send('pause');
  pendingActivity = null;
  replay = record;
  lastReplay = record;
  start('replay', record.offset);
  status('기록 재현 중');
}
function mainAction() {
  if (!level || pendingLevel) return;
  if (activity === 'paused') pause();
  else if (activity === 'replay-finished') replayRun(replay);
  else if (mode === 'ai') {
    if (ai?.trained) observePolicy(true);
    else train();
  } else {
    if (sound) enableAudio();
    start('manual');
    status('플레이 중');

  }
}
function acceptJump() {
  if (activity === 'manual') jump = true;
  else if (mode === 'manual' && ['ready', 'cleared'].includes(activity)) mainAction();
}
function manualEnded() {
  const currentLevel = level;
  const attempt = { progress: progress(level, state), cleared: state.status === 'cleared',
    passed: state.passed, replay: makeReplay(level, actions, state.tick) };
  const attempts = (user?.attempts ?? 0) + 1;
  user = { attempts, best: Math.max(user?.best ?? 0, attempt.progress),
    passed: Math.max(user?.passed ?? 0, attempt.passed), cleared: !!user?.cleared || attempt.cleared,
    replay: !user?.replay || attempt.progress > user.best ? attempt.replay : user.replay };
  saveManual(manualKey(currentLevel), attempt).then(record => {
    if (currentLevel === level && (user?.attempts ?? 0) <= record.attempts) { user = record; comparison(); }
  }).catch(() => notice('수동 기록을 저장할 수 없습니다. 현재 탭에서는 기록을 확인할 수 있습니다.'));
  if (attempt.cleared) {
    activity = 'cleared';
    status('스테이지를 클리어했습니다.');
    refresh();
  } else {
    cooldown = 0.72;
    status('충돌 · 다시 시작합니다.');
    comparison();
  }
}
function simulate() {
  if (cooldown > 0) {
    cooldown -= STEP;
    crashAge += STEP;
    if (cooldown <= 0) {
      if (activity === 'manual') { start('manual'); status('플레이 중'); }
      if (activity === 'observe') start('observe');
      if (activity === 'training') {
        policy = previewPolicy ?? policy;
        previewAttempt++;
        start('training');
      }
    }
    return;
  }
  if (activity === 'training' && !policy) return;
  let press = false;
  if (activity === 'manual') {
    press = jump;
    jump = false;
    if (press) actions.push(state.tick);
  } else if (['training', 'observe'].includes(activity) && state.tick % DECISION_STEPS === 0) {
    q = forward(policy, observe(level, state)).at(-1);
    selectedAction = greedy(q);
    press = selectedAction === 1;
  } else if (activity === 'replay' && replay.actions[replayIndex] === state.tick) {
    press = true;
    replayIndex++;
  }
  previousState = { ...state };
  const launched = press && state.grounded;
  step(level, state, press);
  if (launched && sound) playJump();
  if (activity === 'manual' && state.status !== 'running') manualEnded();
  else if (activity === 'training' && state.status !== 'running') {
    cooldown = state.status === 'cleared' ? 1.2 : 0.72;
  } else if (activity === 'observe' && state.status !== 'running') {
    cooldown = state.status === 'cleared' ? 1.2 : 0.72;
    status(state.status === 'cleared' ? '관찰 정책이 스테이지를 클리어했습니다.' : '관찰 정책이 충돌했습니다.');
  } else if (activity === 'replay' && (state.tick >= replay.ticks || state.status !== 'running')) {
    activity = 'replay-finished';
    status('재현 종료 · 진행률 ' + percent(progress(level, state)));
    refresh();
  }
}
function frame(now) {
  const dt = lastFrame == null ? 0 : Math.min(0.2, (now - lastFrame) / 1000);
  lastFrame = now;
  if (level) {
    if (['manual', 'observe', 'replay', 'training'].includes(activity) && !document.hidden) {
      elapsed += dt;
      while (elapsed >= STEP && ['manual', 'observe', 'replay', 'training'].includes(activity)) {
        elapsed -= STEP;
        simulate();
      }
    }
    const moving = ['manual', 'observe', 'replay', 'training'].includes(activity);
    if (state && (renderedState !== state || renderedActivity !== activity || moving)) {
      renderedState = state;
      renderedActivity = activity;
      const fraction = Math.min(1, elapsed / STEP);
      const tween = (before, after) => before + (after - before) * fraction;
      const display = moving && !cooldown && previousState
        ? { ...state, x: tween(previousState.x, state.x), y: tween(previousState.y, state.y),
          angle: tween(previousState.angle, state.angle || (previousState.angle > 2 ? Math.PI : 0)) }
        : state;
      const attempt = activity === 'training' ? previewAttempt : activity === 'manual' ? (user?.attempts ?? 0) + 1 : 0;
      render(canvas, level, display, !reducedMotion.matches, crashAge, attempt);
      const current = progress(level, state);
      $('progress').value = current;
      $('progress-label').textContent = percent(current);
    }
    if (activity === 'observe' && now >= clock) { diagnostics(); clock = now + 160; }
    if (activity === 'training') {
      frameCount++;
      if (dt > 0.033) slowFrames++;
      if (now >= nextBudgetAt) {
        const max = mobile.matches ? 8 : 16;
        budget = slowFrames / frameCount > 0.18 ? Math.max(3, budget - 2) : Math.min(max, budget + 1);
        send('budget', { ms: budget });
        nextBudgetAt = now + 1400;
        frameCount = slowFrames = 0;
      }
    }
  }
  requestAnimationFrame(frame);
}

function finishLoad(report) {
  epoch = pendingLevel.epoch;
  level = pendingLevel.target;
  pendingLevel = null;
  ai = report;
  user = lastReplay = null;
  for (const id of ['baseline', 'replay-comparison']) $(id).textContent = '';
  $('transfer-source').replaceChildren(new Option('선택', ''), ...levels.filter(entry => entry !== level)
    .map(entry => new Option(entry.name + (entry.legacy ? ' · v' + entry.version : ''), levelKey(entry))));
  send('budget', { ms: budget });
  ready();
  void loadManual(level);
  saveSettings();
}

if (worker) worker.onmessage = ({ data }) => {
  if (data.type === 'load-blocked' && data.requestedEpoch === pendingLevel?.epoch) {
    pendingLevel = null;
    $('level').value = levelKey(level);
    if (activity === 'training') { activity = 'ready'; status('스테이지 변경 전에 학습을 일시정지했습니다.'); }
    refresh();
    return;
  }
  if (pendingLevel && data.epoch === pendingLevel.epoch) {
    if (data.type === 'notice') { notice(data.message); return; }
    if (data.type !== 'status') return;
    finishLoad(data);
    return;
  }
  if (data.epoch !== epoch) return;
  switch (data.type) {
    case 'notice': notice(data.message); break;
    case 'status':
      ai = data;
      if (activity === 'training' && data.mode === 'training') {
        pendingActivity = null;
        previewPolicy = data.preview;
        policy ??= previewPolicy;
      }
      if (activity === 'training' && data.mode === 'paused' && (!pendingActivity || data.stopReason)) {
        pendingActivity = null;
        activity = 'ready';
        status(data.stopReason === 'target' ? '설정한 학습 횟수를 완료했습니다.' : '학습 일시정지');
      }
      refresh();
      break;
    case 'policy':
      if (mode !== 'ai' || pendingActivity !== 'observe') break;
      pendingActivity = null;
      if (!data.weights) { notice('보존된 정책이 없습니다.'); refresh(); break; }
      policy = data.weights;
      start('observe');
      status(watchingBest ? '보존된 최고 정책 재생 중' : '현재 정책을 탐색 없이 실시간으로 관찰 중');
      break;
    case 'replay': replayRun(data.replay); break;
    case 'benchmark':
      $('baseline').textContent = '정책 ' + percent(data.policy) + ' · 무작위 ' + data.runs
        + '회 평균 ' + percent(data.randomAverage) + ' · 최고 ' + percent(data.randomBest)
        + ' · 클리어 ' + data.randomClears + '회';
      break;
  }
};
if (worker) worker.onerror = () => {
  worker.terminate();
  worker = null;
  mode = 'manual';
  if (pendingLevel) finishLoad(null);
  else if (level) ready();
  notice('학습 Worker를 실행할 수 없습니다. 직접 플레이는 가능합니다.');
};

$('level').onchange = event => { notice(); loadLevel(levels.find(entry => levelKey(entry) === event.target.value)); };
$('manual').onclick = () => switchMode('manual');
$('ai').onclick = () => switchMode('ai');
$('overlay-action').onclick = mainAction;
$('pause').onclick = pause;
$('train').onclick = () => train();
$('count').onchange = saveSettings;
$('sound').onclick = () => {
  sound = !sound;
  if (sound) enableAudio();
  $('sound').setAttribute('aria-pressed', String(sound));
  saveSettings();
};
$('observe').onclick = () => observePolicy();
$('best').onclick = () => observePolicy(true);
$('manual-replay').onclick = () => replayRun(user?.replay);
$('benchmark').onclick = () => send('benchmark');
$('compare').onclick = () => {
  const finish = initialState(level, lastReplay.offset);
  const inputs = new Set(lastReplay.actions);
  while (finish.tick < lastReplay.ticks && finish.status === 'running') step(level, finish, inputs.has(finish.tick));
  $('replay-comparison').textContent = '선택한 재현 ' + percent(progress(level, finish)) + ' · 현재 최고 정책 ' + percent(ai.best);
};
$('transfer-source').onchange = refresh;
$('transfer').onclick = () => send('transfer', { from: $('transfer-source').value });
$('open-checkpoint').onclick = () => {
  ready();
  send('open-checkpoint', { branch: !ai.onConflictBranch });
};
$('reset').onclick = () => {
  if (!confirm(level.name + '의 AI 정책과 학습 기록을 초기화할까요?')) return;
  pendingActivity = null;
  ready();
  lastReplay = null;
  for (const id of ['baseline', 'replay-comparison']) $(id).textContent = '';
  send('reset');
};
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($('game').requestFullscreen) await $('game').requestFullscreen();
    else notice('이 브라우저에서는 전체 화면을 사용할 수 없습니다.');
  } catch { notice('전체 화면을 열 수 없습니다.'); }
};
$('analysis').ontoggle = diagnostics;
canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  if (sound && mode === 'manual') enableAudio();
  acceptJump();
});
window.addEventListener('keydown', event => {
  if (!level || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Escape') { pause(); return; }
  if (event.code === 'Space' && mode === 'manual'
    && !event.target.closest?.('input,select,textarea,button,summary,[contenteditable],a')) {
    event.preventDefault();
    if (sound) enableAudio();
    acceptJump();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && level) {
    if (['manual', 'observe', 'training', 'replay'].includes(activity)) pause();
    else send('pause');
  }
});
window.addEventListener('pagehide', () => send('pause'));
new ResizeObserver(([entry]) => {
  const pixelRatio = Math.min(2, devicePixelRatio);
  const width = Math.max(1, Math.round(entry.contentRect.width * pixelRatio));
  const height = Math.max(1, Math.round(entry.contentRect.height * pixelRatio));
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
  renderedState = null;
  if (level && state) render(canvas, level, state, !reducedMotion.matches, crashAge);
}).observe(canvas);
new ResizeObserver(([{ contentRect }]) => {
  const chart = $('chart');
  if (!contentRect.width || !contentRect.height) return;
  if (chart.width === Math.round(contentRect.width) && chart.height === Math.round(contentRect.height)) return;
  chart.width = Math.round(contentRect.width);
  chart.height = Math.round(contentRect.height);
  chartReport = null;
  diagnostics();
}).observe($('chart'));
try {
  levels = await loadLevels();
  let settings;
  try { settings = await read('settings'); } catch { notice('이 브라우저에서는 기록 저장이 제한됩니다.'); }
  mode = worker && settings?.mode === 'ai' ? 'ai' : 'manual';
  sound = settings?.sound !== false;
  if (settings?.count) $('count').value = settings.count;
  const versions = [...new Set(levels.map(entry => entry.version))];
  const groups = versions.map((version, index) => {
    const group = document.createElement('optgroup');
    group.label = index === 0 ? '새 코스' : '기존 코스와 기록 · v' + version;
    for (const [n, entry] of levels.filter(stage => stage.version === version).entries()) {
      group.append(new Option('0' + (n + 1) + ' · ' + entry.name, levelKey(entry)));
    }
    return group;
  });
  $('level').replaceChildren(...groups);
  const savedLevel = levels.find(entry => levelKey(entry) === settings?.level);
  const migratedLevel = !settings?.courseVersion && savedLevel?.version === 2
    ? levels.find(entry => !entry.legacy && entry.id === savedLevel.id)
    : savedLevel;
  loadLevel(migratedLevel ?? levels.find(entry => !entry.legacy && entry.id === settings?.level) ?? levels[0]);
  requestAnimationFrame(frame);
} catch (error) {
  status(error.message);
}
