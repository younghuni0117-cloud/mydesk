import {LENGTHS, X_LIMIT, HOLD_SECONDS, MAX_FORCE} from './cartpole-evolution-core.mjs?v=2';
import {options} from './cartpole-evolution-training.mjs?v=2';

const get = name => document.getElementById('cpe-' + name);
const prefix = 'mydesk.cartpole-evolution.v2.';
const colors = ['#6ee7ff', '#ffad7f', '#a7ee93', '#d1b2ff', '#ffe397'];
const labels = {loading: '불러오는 중', ready: '학습 대기', running: 'PPO 학습 중',
  paused: '일시정지', evaluating: '고정 평가 중', replaying: '고정 평가 재생 중', replayDone: '고정 평가 재생 완료', error: '실행 오류'};
const numeric = new Intl.NumberFormat('ko-KR');
let worker, frames = [], metrics = null, phase = 'loading', raf = 0, autoResume = false;
let lastCheckpoint = null, storageWarning = '', notice = '', replayAvailable = false, replayFrame = false;
let savedSettings = read('settings') ?? {};
let config = options(savedSettings);
let unlocked = read('unlocked');
unlocked = Number.isInteger(unlocked) ? Math.min(5, Math.max(1, unlocked)) : 1;
for (let i = 1; i < 5; i++) if (read('level' + i)?.milestone?.passed >= 7) unlocked = Math.max(unlocked, i + 1);
let level = Math.min(unlocked, Math.max(1, Math.trunc(Number(savedSettings.level)) || 1));
let representative = 0;
let speed = [0, 1, 4].includes(savedSettings.speed) ? savedSettings.speed : 0;
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
  write('settings', {...config, level, speed});
}

function renderNotice() {
  get('notice').textContent = [storageWarning, notice].filter(Boolean).join(' ');
}

function controls() {
  get('state').textContent = labels[phase];
  get('train').textContent = phase === 'running' ? '일시정지' : phase === 'paused' ? '학습 재개' : '학습 시작';
  get('train').disabled = ['loading', 'evaluating', 'error'].includes(phase);
  get('evaluate').disabled = ['loading', 'evaluating', 'error'].includes(phase);
  get('reset').disabled = phase === 'loading';
  get('restore').hidden = !read('backup' + level);
  get('replay').hidden = !replayAvailable;
  get('replay').disabled = ['evaluating', 'replaying', 'running', 'error'].includes(phase);
}

function showLevels() {
  const buttons = Array.from({length: 5}, (_, i) => {
    const n = i + 1, button = document.createElement('button');
    button.type = 'button';
    button.disabled = n > unlocked;
    button.textContent = n > unlocked ? '🔒 ' + n : 'Lv. ' + n;
    button.setAttribute('aria-label', '레벨 ' + n + (n > unlocked ? ' 잠김' : ''));
    button.setAttribute('aria-pressed', String(n === level));
    button.addEventListener('click', () => { if (n !== level) openLevel(n); });
    return button;
  });
  get('levels').replaceChildren(...buttons);
}

function showEnvironments(count) {
  representative = Math.min(representative, Math.max(0, count - 1));
  const select = get('representative');
  if (select.options.length !== count) {
    select.replaceChildren(...Array.from({length: count}, (_, i) => new Option('환경 ' + (i + 1), i)));
  }
  select.value = representative;
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
  frames = [];
  replayAvailable = replayFrame = false;
  notice = '';
  lastCheckpoint = read('level' + level);
  renderNotice();
  saveSettings();
  showLevels();
  showEnvironments(config.envs);
  controls();
  showStats();
  requestDraw();
  try {
    const instance = new Worker('./cartpole-evolution-worker.mjs?v=2', {type: 'module'});
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
        controls();
      } else if (data.type === 'frame') {
        frames = data.frames;
        replayFrame = Boolean(data.replay);
        if (!replayFrame) showEnvironments(frames.length);
        requestDraw();
      } else if (data.type === 'recording') {
        replayAvailable = true;
        controls();
      } else if (data.type === 'stats') {
        metrics = data;
        if (data.pending) { notice = '진행 중인 PPO 수집·업데이트가 끝나면 새 설정을 적용합니다.'; }
        else if (notice.startsWith('진행 중인 PPO')) notice = '';
        renderNotice();
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
    instance.postMessage({type: 'speed', speed});
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
function draw(time) {
  raf = 0;
  const s = surface(canvas);
  if (!s) return;
  const {ctx, width, height} = s;
  const reach = LENGTHS.slice(0, level).reduce((a, b) => a + b, 0);
  const scale = Math.max(12, Math.min((width - 28) / (2 * (X_LIMIT + reach)), (height - 58) / (reach * 2 + .16)));
  const px = x => width / 2 + x * scale, py = y => height / 2 - y * scale;
  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, '#1b405a');
  background.addColorStop(1, '#101e30');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#a2c5df22';
  ctx.lineWidth = 1;
  for (let x = -X_LIMIT; x <= X_LIMIT + .01; x += .4) line(ctx, px(x), 30, px(x), height - 30);
  for (let y = -.4; y < reach + .1; y += .4) {
    if (py(y) > 30 && py(y) < height - 30) line(ctx, px(-X_LIMIT), py(y), px(X_LIMIT), py(y));
  }
  const railY = py(0) + 11;
  ctx.strokeStyle = '#9eb7cb';
  ctx.lineWidth = 2;
  line(ctx, px(-X_LIMIT), railY, px(X_LIMIT), railY);
  for (const end of [-X_LIMIT, X_LIMIT]) line(ctx, px(end), railY - 4, px(end), railY + 4);
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c1d4e5';
  ctx.fillText('−2.4 m', px(-X_LIMIT), railY + 17);
  ctx.fillText('+2.4 m', px(X_LIMIT), railY + 17);
  const selected = replayFrame ? 0 : representative;
  const active = frames[selected];
  if (active) {
    const [x] = active.points[0];
    ctx.strokeStyle = '#c5dae666';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    line(ctx, px(x), py(0), px(x), py(reach));
    ctx.setLineDash([]);
  }
  const order = frames.map((_, i) => i).filter(i => i !== selected);
  if (active) order.push(selected);
  for (const i of order) {
    const f = frames[i], [x] = f.points[0], color = colors[i];
    ctx.globalAlpha = i === selected ? 1 : .28;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(4, Math.min(10, scale * .13));
    ctx.lineCap = 'round';
    ctx.fillRect(px(x) - 14, py(0) - 3, 28, 12);
    for (let n = 1; n < f.points.length; n++) {
      const [a, b] = f.points[n - 1], [u, v] = f.points[n];
      line(ctx, px(a), py(b), px(u), py(v));
    }
    ctx.fillStyle = '#102438';
    for (const [u,v] of f.points) {
      ctx.beginPath();
      ctx.arc(px(u), py(v), 2.4, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (active) {
    const [x] = active.points[0], origin = px(x), tip = origin + active.force / MAX_FORCE * 40;
    if (Math.abs(tip - origin) > 4) {
      ctx.strokeStyle = '#f6d783';
      ctx.lineWidth = 2;
      const direction = Math.sign(tip - origin);
      line(ctx, origin, railY - 25, tip, railY - 25);
      line(ctx, tip, railY - 25, tip - direction * 5, railY - 29);
      line(ctx, tip, railY - 25, tip - direction * 5, railY - 21);
    }
  }
  get('live').textContent = replayFrame ? '고정 조건 1번' : '환경 ' + (selected + 1) + ' / ' + (frames.length || config.envs);
  get('live').style.color = colors[selected];
  get('time').textContent = format(active?.time ?? 0) + '초';
  get('force').textContent = format(active?.force ?? 0, 1) + ' N';
  get('hold').textContent = '직립 ' + format(active?.streak ?? 0) + ' / ' + HOLD_SECONDS + '초';
  get('hold').style.color = active?.success ? '#a7ee93' : '';
  paintCount++;
  if (time - fpsTime >= 1000) {
    renderFps = phase === 'running' ? Math.round(paintCount * 1000 / (time - fpsTime)) : 0;
    paintCount = 0;
    fpsTime = time;
  }
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
get('speed').value = speed;
get('env').onchange = get('seconds').onchange = configure;
get('speed').onchange = () => {
  speed = Number(get('speed').value);
  saveSettings();
  worker?.postMessage({type: 'speed', speed});
};
get('representative').onchange = event => { representative = Number(event.target.value); requestDraw(); };
get('train').onclick = () => worker?.postMessage({type: phase === 'running' ? 'pause' : 'start'});
get('evaluate').onclick = () => worker?.postMessage({type: 'evaluate'});
get('replay').onclick = () => worker?.postMessage({type: 'replay'});
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
  if (document.hidden) {
    autoResume = phase === 'running';
    if (autoResume || phase === 'evaluating' || phase === 'replaying') worker?.postMessage({type: 'pause'});
  } else if (autoResume) {
    autoResume = false;
    worker?.postMessage({type: 'start'});
  }
});
openLevel(level);
