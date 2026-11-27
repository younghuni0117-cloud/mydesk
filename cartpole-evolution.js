import {DT, LENGTHS, X_LIMIT, HOLD_SECONDS, MAX_FORCE} from './cartpole-evolution-core.mjs?v=2';
import {episodeBudget, options} from './cartpole-evolution-training.mjs?v=3';
import {PreviewEpisode, interpolateFrame} from './cartpole-evolution-preview.mjs?v=3';

const get = name => document.getElementById('cpe-' + name);
const prefix = 'mydesk.cartpole-evolution.v2.';
const labels = {loading: '불러오는 중', ready: '학습 대기', running: 'PPO 학습 중',
  paused: '일시정지', complete: '목표 횟수 완료', evaluating: '고정 평가 중', error: '실행 오류'};
const numeric = new Intl.NumberFormat('ko-KR');
let worker, metrics = null, phase = 'loading', raf = 0, autoResume = false;
let lastCheckpoint = null, storageWarning = '', notice = '';
let latestPolicy, modelPolicy, preview, replay, recording, lastDraw;
let savedSettings = read('settings') ?? {};
let config = options(savedSettings);
let unlocked = read('unlocked');
unlocked = Number.isInteger(unlocked) ? Math.min(5, Math.max(1, unlocked)) : 1;
for (let i = 1; i < 5; i++) if (read('level' + i)?.milestone?.passed >= 7) unlocked = Math.max(unlocked, i + 1);
let level = Math.min(unlocked, Math.max(1, Math.trunc(Number(savedSettings.level)) || 1));
let count = episodeBudget(savedSettings.count);
const canvas = get('canvas'), chart = get('chart');

function read(key) {
  try { return JSON.parse(localStorage.getItem(prefix + key)); } catch { return null; }
}

function write(key, value) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value));
    return true;
  } catch {
    storageWarning = '브라우저 저장소를 사용할 수 없습니다.';
    renderNotice();
    return false;
  }
}

function saveSettings() {
  write('settings', {...config, level, count});
}

function renderNotice() {
  get('notice').textContent = [storageWarning, notice].filter(Boolean).join(' ');
}

function controls() {
  get('state').textContent = labels[phase];
  const resumable = phase === 'paused' && metrics?.incomplete;
  get('train').textContent = phase === 'running' ? '일시정지' : resumable ? '학습 재개' : '학습 시작';
  get('train').disabled = ['loading', 'evaluating', 'error'].includes(phase);
  get('count').disabled = phase === 'running' || resumable;
  get('model').textContent = modelPolicy || replay ? '실시간 관찰' : '모델 실행';
  get('model').disabled = (!latestPolicy?.updates && !replay) || ['loading', 'evaluating', 'error'].includes(phase);
  get('evaluate').disabled = ['loading', 'evaluating', 'error'].includes(phase);
  get('reset').disabled = phase === 'loading';
  get('restore').hidden = !read('backup' + level);
  get('replay').hidden = !recording;
  get('replay').disabled = phase === 'evaluating' || Boolean(replay);
}

function showLevels() {
  const choices = Array.from({length: 5}, (_, i) => {
    const n = i + 1, option = new Option(`Level ${n} · 링크 ${n}개${n > unlocked ? ' (잠김)' : ''}`, n);
    option.disabled = n > unlocked;
    return option;
  });
  get('level').replaceChildren(...choices);
  get('level').value = level;
}

function format(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function showStats() {
  const {recent, evaluation, diagnostics} = metrics ?? {};
  get('episode').textContent = numeric.format(metrics?.episodes ?? 0);
  get('reward').textContent = format(recent?.mean, 1);
  get('success').textContent = recent ? Math.round(recent.passed / recent.attempts * 100) + '%' : '—';
  get('test').textContent = evaluation ? evaluation.passed + ' / ' + evaluation.attempts : '—';
  const plan = get('plan');
  plan.hidden = !metrics?.target;
  if (!plan.hidden) {
    plan.textContent = `이번 학습 ${numeric.format(metrics.episodes - metrics.planStart)} / ${numeric.format(metrics.target - metrics.planStart)}회`;
  }
  const rows = {
    '환경 Steps': numeric.format(metrics?.steps ?? 0),
    '학습 처리량': numeric.format(metrics?.rate ?? 0) + ' steps/s',
    '렌더링': renderFps ? renderFps + ' FPS' : '—',
    'PPO 업데이트': metrics?.updates ?? 0,
    '최초 직립 도달': format(metrics?.first) + ' 초',
    '훈련 최고 직립': format(metrics?.bestHold) + ' 초',
    '카트 최대 편위': format(metrics?.travel) + ' m',
    '평가 최고 직립': format(evaluation?.hold) + ' 초',
    '최고 평가 통과': metrics?.bestEvaluation ? metrics.bestEvaluation.passed + ' / 8' : '—',
    '평가 정책 업데이트': evaluation?.updates ?? '—',
    '해금 기록': lastCheckpoint?.milestone ? '업데이트 ' + lastCheckpoint.milestone.updates : '—',
    'Policy loss': format(diagnostics?.policyLoss, 4),
    'Value loss': format(diagnostics?.valueLoss, 4),
    'Entropy': format(diagnostics?.entropy, 4),
    'Approx. KL': format(diagnostics?.kl, 5),
    'Clip fraction': format(diagnostics?.clipFraction, 3)
  };
  if (get('results').open) {
    get('details').replaceChildren(...Object.entries(rows).flatMap(([name, value]) => {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = name;
      dd.textContent = value;
      return [dt, dd];
    }));
    plot();
  }
}

function openLevel(next) {
  worker?.terminate();
  level = next;
  phase = 'loading';
  autoResume = false;
  metrics = null;
  latestPolicy = modelPolicy = preview = replay = recording = lastDraw = null;
  notice = '';
  lastCheckpoint = read('level' + level);
  renderNotice();
  saveSettings();
  showLevels();
  controls();
  showStats();
  requestDraw();
  try {
    const instance = new Worker('./cartpole-evolution-worker.mjs?v=3', {type: 'module'});
    worker = instance;
    instance.onerror = () => error('학습 Worker를 불러오지 못했습니다.');
    instance.onmessage = ({data}) => {
      if (worker !== instance) return;
      if (data.type === 'ready') {
        phase = 'ready';
        if (data.warning) { notice = data.warning; renderNotice(); }
        controls();
      } else if (data.type === 'state') {
        phase = data.state;
        lastDraw = null;
        controls();
        requestDraw();
      } else if (data.type === 'policy') {
        latestPolicy = data.policy;
        controls();
        requestDraw();
      } else if (data.type === 'recording') {
        recording = data.frames;
        controls();
      } else if (data.type === 'stats') {
        metrics = data;
        if (data.pending) { notice = '진행 중인 PPO 수집·업데이트가 끝나면 새 설정을 적용합니다.'; }
        else if (notice.startsWith('진행 중인 PPO')) notice = '';
        renderNotice();
        controls();
        showStats();
      } else if (data.type === 'checkpoint') {
        lastCheckpoint = data.checkpoint;
        write('level' + level, lastCheckpoint);
      } else if (data.type === 'milestone') {
        unlocked = Math.max(unlocked, Math.min(5, level + 1));
        write('unlocked', unlocked);
        showLevels();
        notice = level < 5 ? '고정 평가 통과 · 다음 레벨이 열렸습니다.' : '최종 레벨 고정 평가를 통과했습니다.';
        renderNotice();
      } else if (data.type === 'error') error(data.message);
    };
    instance.postMessage({type: 'init', level, config, checkpoint: lastCheckpoint});
  } catch (e) { error(e.message); }
}

function error(message) {
  phase = 'error';
  notice = message;
  renderNotice();
  controls();
}

function surface(element) {
  const {width, height} = element.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  if (!width || !height) return null;
  const w = Math.round(width * dpr), h = Math.round(height * dpr);
  if (element.width !== w || element.height !== h) { element.width = w; element.height = h; }
  const ctx = element.getContext('2d');
  ctx.setTransform(w / width, 0, 0, h / height, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return {ctx, width, height};
}

function line(ctx, x, y, u, v) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(u, v);
  ctx.stroke();
}

let paintCount = 0, fpsTime = performance.now(), renderFps = 0;

function displayFrame(elapsed) {
  if (replay) {
    replay.time += elapsed;
    const position = Math.min(recording.length - 1, replay.time / DT);
    const i = Math.floor(position);
    return interpolateFrame(recording[i], recording[i + 1], position - i);
  }
  const policy = modelPolicy ?? latestPolicy;
  if (!policy) return null;
  const playing = Boolean(modelPolicy) || ['running', 'complete'].includes(phase);
  if (!preview || (playing && preview.done)) {
    preview = new PreviewEpisode(level, config.seconds, policy, !modelPolicy);
    elapsed = 0;
  }
  return preview.frame(playing ? elapsed : 0);
}

function circle(ctx, x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function draw(time) {
  raf = 0;
  const elapsed = lastDraw === null ? 0 : Math.min(.1, (time - lastDraw) / 1000);
  lastDraw = time;
  const active = displayFrame(elapsed);
  const surfaceState = surface(canvas);
  if (!surfaceState) return;
  const {ctx, width, height} = surfaceState;
  const reach = LENGTHS.slice(0, level).reduce((a, b) => a + b, 0);
  const scale = Math.max(12, Math.min((width - 25) / (2 * (reach + .58)), (height - 80) / (reach * 2 + .23)));
  const cart = active?.points[0][0] ?? 0, center = .85 * cart;
  const px = x => width / 2 + (x - center) * scale;
  const py = y => height / 2 - y * scale;
  const railY = py(0) + 16;
  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, '#ffffff');
  background.addColorStop(1, '#f0f5fa');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#e5edf6';
  ctx.lineWidth = 1;
  for (let x = -3; x <= 3; x += .25) line(ctx, px(x), 34, px(x), height - 34);
  for (let y = -reach; y <= reach; y += .25) line(ctx, 0, py(y), width, py(y));

  ctx.lineCap = 'round';
  ctx.strokeStyle = '#d5e0ec';
  ctx.lineWidth = 9;
  line(ctx, px(-X_LIMIT), railY + 3, px(X_LIMIT), railY + 3);
  ctx.strokeStyle = '#8499ad';
  ctx.lineWidth = 3;
  line(ctx, px(-X_LIMIT), railY, px(X_LIMIT), railY);
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#536a80';
  for (const x of [-2.4, -2, -1, 0, 1, 2, 2.4]) {
    line(ctx, px(x), railY + 7, px(x), railY + 11);
    ctx.fillText(x === 0 ? '0 m' : String(x), px(x), railY + 25);
  }

  if (active) {
    const x = px(cart), y = py(0);
    const half = Math.min(40, Math.max(17, .18 * scale));
    ctx.strokeStyle = '#aebdcd';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    line(ctx, x, y, x, py(reach));
    ctx.setLineDash([]);

    // Polymer-coated links, brushed steel axles and a blue anodized carriage.
    for (let i = 1; i < active.points.length; i++) {
      const [a, b] = active.points[i - 1], [u, v] = active.points[i];
      const ax = px(a), ay = py(b), bx = px(u), by = py(v);
      const thickness = Math.max(7, 13 - i);
      ctx.strokeStyle = '#8f4718';
      ctx.lineWidth = thickness;
      line(ctx, ax, ay, bx, by);
      ctx.strokeStyle = '#e59447';
      ctx.lineWidth = thickness - 2;
      line(ctx, ax, ay, bx, by);
      ctx.strokeStyle = '#ffd9a5';
      ctx.lineWidth = 2;
      line(ctx, ax - 1.1, ay - 1.1, bx - 1.1, by - 1.1);
    }
    const cartPaint = ctx.createLinearGradient(0, y - 9, 0, y + 13);
    cartPaint.addColorStop(0, '#568cbb');
    cartPaint.addColorStop(.35, '#32678f');
    cartPaint.addColorStop(1, '#173c5b');
    for (const offset of [-.67, .67]) {
      circle(ctx, x + half * offset, railY - 2, 5, '#1b3045');
      circle(ctx, x + half * offset, railY - 2, 2, '#8ca5bd');
    }
    ctx.beginPath();
    ctx.roundRect(x - half, y - 8, half * 2, 20, 5);
    ctx.fillStyle = cartPaint;
    ctx.fill();
    ctx.strokeStyle = '#8ab1d2';
    ctx.lineWidth = 1;
    line(ctx, x - half + 6, y - 5, x + half - 6, y - 5);
    for (const [u, v] of active.points) {
      circle(ctx, px(u), py(v), 4.8, '#27394b');
      circle(ctx, px(u), py(v), 2.8, '#d0dce7');
    }
    const tip = x + active.force / MAX_FORCE * 40;
    if (Math.abs(tip - x) > 4) {
      ctx.strokeStyle = '#26746c';
      ctx.lineWidth = 2;
      const direction = Math.sign(tip - x);
      line(ctx, x, railY - 31, tip, railY - 31);
      line(ctx, tip, railY - 31, tip - direction * 5, railY - 35);
      line(ctx, tip, railY - 31, tip - direction * 5, railY - 27);
    }
  }

  const updates = preview?.updates ?? 0;
  get('live').textContent = replay ? '고정 평가 · 1배속'
    : (modelPolicy ? '모델 실행' : '실시간 관찰') + ' · PPO ' + numeric.format(updates);
  get('time').textContent = format(active?.time ?? 0) + '초';
  get('force').textContent = format(active?.force ?? 0, 1) + ' N';
  get('hold').textContent = '직립 ' + format(active?.streak ?? 0) + ' / ' + HOLD_SECONDS + '초';
  get('hold').style.color = active?.success ? '#19704a' : '';
  paintCount++;
  if (time - fpsTime >= 1000) {
    renderFps = Math.round(paintCount * 1000 / (time - fpsTime));
    paintCount = 0;
    fpsTime = time;
  }
  if (!document.hidden && (modelPolicy || ['running', 'complete'].includes(phase)
      || (replay && replay.time < (recording.length - 1) * DT))) requestDraw();
}
function requestDraw() {
  if (!raf) raf = requestAnimationFrame(draw);
}

function plot() {
  const s = surface(chart);
  if (!s) return;
  const {ctx, width, height} = s, history = metrics?.history ?? [];
  if (!history.length) {
    ctx.fillStyle = '#475e76';
    ctx.fillText('완료된 Episode가 쌓이면 추세를 표시합니다.', 4, height / 2);
    return;
  }
  const rewards = history.map(row => row.reward);
  const min = Math.min(0, ...rewards), max = Math.max(1, ...rewards);
  const px = i => 34 + i * (width - 41) / Math.max(1, rewards.length - 1);
  const py = reward => 8 + (max - reward) / (max - min) * (height - 28);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#475e76';
  for (const value of [min, (min + max) / 2, max]) {
    ctx.strokeStyle = '#e0e8ef';
    line(ctx, 33, py(value), width - 4, py(value));
    ctx.fillText(format(value, 0), 0, py(value) + 3);
  }
  ctx.fillText('EP ' + history[0].episode, 34, height - 2);
  ctx.textAlign = 'right';
  ctx.fillText('EP ' + history.at(-1).episode, width - 4, height - 2);
  const series = [rewards, rewards.map((_, i) => {
    const window = rewards.slice(Math.max(0, i - 29), i + 1);
    return window.reduce((sum, r) => sum + r, 0) / window.length;
  })];
  for (const [i, values] of series.entries()) {
    ctx.strokeStyle = i ? '#245683' : '#9fb7ce';
    ctx.lineWidth = i ? 2 : 1;
    ctx.beginPath();
    values.forEach((v, n) => n ? ctx.lineTo(px(n), py(v)) : ctx.moveTo(px(n), py(v)));
    if (values.length === 1) ctx.lineTo(px(0) + 4, py(values[0]));
    ctx.stroke();
  }
}

function configure() {
  config = options({envs: get('env').value, seconds: get('seconds').value});
  get('env').value = config.envs;
  get('seconds').value = config.seconds;
  saveSettings();
  worker?.postMessage({type: 'config', config});
}

get('env').value = config.envs;
get('seconds').value = config.seconds;
get('count').value = count;
get('env').onchange = get('seconds').onchange = configure;
get('count').onchange = () => {
  count = episodeBudget(get('count').value);
  get('count').value = count;
  saveSettings();
};
get('level').onchange = event => {
  const next = Number(event.target.value);
  if (next >= 1 && next <= unlocked && next !== level) openLevel(next);
};
get('train').onclick = () => {
  if (phase === 'running') worker?.postMessage({type: 'pause'});
  else {
    get('count').onchange();
    const resume = phase === 'paused' && metrics?.incomplete;
    worker?.postMessage(resume ? {type: 'start'} : {type: 'start', count});
  }
};
get('model').onclick = () => {
  modelPolicy = modelPolicy || replay ? null : latestPolicy;
  replay = preview = lastDraw = null;
  controls();
  requestDraw();
};
get('evaluate').onclick = () => {
  replay = modelPolicy = lastDraw = null;
  worker?.postMessage({type: 'evaluate'});
};
get('replay').onclick = () => {
  if (!recording?.length) return;
  replay = {time: 0};
  modelPolicy = lastDraw = null;
  controls();
  requestDraw();
};
get('reset').onclick = () => {
  if (!confirm('이 레벨의 학습과 기록을 초기화할까요? 완료된 정책은 복원용으로 한 번 보관합니다.')) return;
  if (lastCheckpoint && !write('backup' + level, lastCheckpoint)) return;
  if (write('level' + level, null)) openLevel(level);
};
get('restore').onclick = () => {
  if (!confirm('초기화 직전 기록을 현재 레벨로 복원할까요?')) return;
  const backup = read('backup' + level);
  if (backup && write('level' + level, backup)) openLevel(level);
};
get('results').addEventListener('toggle', showStats);
new ResizeObserver(() => { requestDraw(); plot(); }).observe(canvas);
new ResizeObserver(plot).observe(chart);
document.addEventListener('visibilitychange', () => {
  lastDraw = null;
  if (document.hidden) {
    autoResume = phase === 'running';
    if (autoResume || phase === 'evaluating') worker?.postMessage({type: 'pause'});
  } else if (autoResume) {
    autoResume = false;
    worker?.postMessage({type: 'start'});
  }
  if (!document.hidden) requestDraw();
});
openLevel(level);
