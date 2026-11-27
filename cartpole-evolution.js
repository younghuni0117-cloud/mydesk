import {X_LIMIT, HOLD_SECONDS, MAX_FORCE} from './cartpole-evolution-core.mjs?v=finger1';
import {episodeBudget, options} from './cartpole-evolution-training.mjs?v=finger1';
import {PreviewEpisode, railProjection} from './cartpole-evolution-preview.mjs?v=finger1';
import {CartSync} from './cartpole-evolution-sync.mjs?v=1';

const get = name => document.getElementById('cpe-' + name);
const prefix = 'mydesk.cartpole-evolution.v4.';
const settingsKey = 'mydesk.cartpole-evolution.v2.settings';
const labels = {loading: '불러오는 중', ready: '학습 대기', running: 'PPO 학습 중',
  paused: '일시정지', complete: '목표 횟수 완료', evaluating: '고정 평가 중', error: '실행 오류'};
const numeric = new Intl.NumberFormat('ko-KR');
let worker, metrics = null, phase = 'loading', raf = 0, autoResume = false;
let lastCheckpoint = null;
let latestPolicy, modelPolicy, preview, lastDraw;
let savedSettings = read('settings') ?? {};
let config = options(savedSettings);
const ranges = [500, 1000, 2000, 5000, 10000, 0];
let chartRange = ranges.includes(savedSettings.chartRange) ? savedSettings.chartRange : 500;
let zoom = 1, panX = 0, panY = 0;
const pointers = new Map();
let gesture = null;
let showGuides = savedSettings.showGuides !== false;
let unlocked = read('unlocked');
unlocked = Number.isInteger(unlocked) ? Math.min(5, Math.max(1, unlocked)) : 1;
for (let i = 1; i < 5; i++) if (read('level' + i)?.milestone?.passed >= 7) unlocked = Math.max(unlocked, i + 1);
let level = Math.min(unlocked, Math.max(1, Math.trunc(Number(savedSettings.level)) || 1));
let count = episodeBudget(savedSettings.count);
let sync = null, syncing = false;
const canvas = get('canvas'), chart = get('chart');

function read(key) {
  try { return JSON.parse(localStorage.getItem(key === 'settings' ? settingsKey : prefix + key)); } catch { return null; }
}

function write(key, value) {
  try {
    localStorage.setItem(key === 'settings' ? settingsKey : prefix + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function saveSettings() {
  write('settings', {...config, level, count, chartRange, showGuides});
}

function controls() {
  get('state').textContent = labels[phase];
  const resumable = phase === 'paused' && metrics?.incomplete;
  get('train').textContent = phase === 'running' ? '일시정지' : resumable ? '학습 재개' : '학습 시작';
  get('train').disabled = ['loading', 'evaluating', 'error'].includes(phase);
  get('count').disabled = phase === 'running' || resumable;
  get('model').textContent = modelPolicy ? '실시간 관찰' : '모델 실행';
  get('model').disabled = !latestPolicy?.updates || ['loading', 'evaluating', 'error'].includes(phase);
  get('impact').disabled = !modelPolicy;
  get('reset').disabled = phase === 'loading';
}

function showLevels() {
  const choices = Array.from({length: 5}, (_, i) => {
    const n = i + 1, option = new Option(`링크 ${n}개${n > unlocked ? ' (잠김)' : ''}`, n);
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
  get('episode').textContent = numeric.format(metrics?.episodes ?? 0);
  const total = metrics?.target ? metrics.target - metrics.planStart : 0;
  const completed = total ? Math.min(total, metrics.episodes - metrics.planStart) : 0;
  get('progress').max = total || 1;
  get('progress').value = completed;
  get('progress-text').textContent = `${numeric.format(completed)} / ${numeric.format(total || count)}`;
  plot();
}

function openLevel(next) {
  worker?.terminate();
  level = next;
  phase = 'loading';
  autoResume = false;
  metrics = null;
  latestPolicy = modelPolicy = preview = lastDraw = null;
  get('state').removeAttribute('title');
  lastCheckpoint = read('level' + level);
  saveSettings();
  showLevels();
  controls();
  showStats();
  requestDraw();
  try {
    const instance = new Worker('./cartpole-evolution-worker.mjs?v=finger1', {type: 'module'});
    worker = instance;
    instance.onerror = () => error('학습 Worker를 불러오지 못했습니다.');
    instance.onmessage = ({data}) => {
      if (worker !== instance) return;
      if (data.type === 'ready') {
        phase = 'ready';
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
      } else if (data.type === 'stats') {
        metrics = data;
        controls();
        showStats();
      } else if (data.type === 'checkpoint') {
        lastCheckpoint = data.checkpoint;
        write('level' + level, lastCheckpoint);
        sync?.queue(level, lastCheckpoint);
      } else if (data.type === 'milestone') {
        unlocked = Math.max(unlocked, Math.min(5, level + 1));
        write('unlocked', unlocked);
        showLevels();
      } else if (data.type === 'error') error(data.message);
    };
    instance.postMessage({type: 'init', level, config, checkpoint: lastCheckpoint});
  } catch (e) { error(e.message); }
}

function error(message) {
  phase = 'error';
  get('state').title = message;
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

function displayFrame(elapsed) {
  const policy = modelPolicy ?? latestPolicy;
  if (!policy) return null;
  const playing = Boolean(modelPolicy) || ['running', 'complete'].includes(phase);
  if (!preview || (playing && preview.done)) {
    preview = new PreviewEpisode(level, config.seconds, policy, !modelPolicy);
    preview.env.nextImpact = null;
    elapsed = 0;
  }
  preview.setDisturbance({...config, impactEnabled: !modelPolicy && playing && config.impactEnabled});
  return preview.frame(playing ? elapsed : 0);
}

function circle(ctx, x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawFinger(ctx, active, modelX, modelY) {
  const hit = active.finger;
  const age = active.time - hit.start;
  if (age < 0 || age > hit.duration + .22) return;
  const start = active.points[Math.max(0, hit.body - 1)];
  const end = active.points[hit.body];
  const fraction = hit.body ? (hit.localY / .65 + .5) : 0;
  const x = start[0] + (end[0] - start[0]) * fraction;
  const y = start[1] + (end[1] - start[1]) * fraction;
  const progress = Math.min(1, age / hit.duration);
  const retreat = Math.max(0, (age - hit.duration) / .22);
  const gap = age < hit.duration ? 55 * (1 - progress * progress) : 35 * retreat;
  const tipX = modelX(x) - hit.direction * ((hit.body ? 6 : 24) + gap);
  ctx.save();
  ctx.translate(tipX, modelY(y));
  ctx.scale(hit.direction, 1);
  ctx.globalAlpha = Math.max(0, 1 - retreat);
  const skin = ctx.createLinearGradient(0, -8, 0, 31);
  skin.addColorStop(0, '#ffe0bd');
  skin.addColorStop(1, '#d79e74');
  ctx.fillStyle = skin;
  ctx.strokeStyle = '#af7958';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-58, 2);
  ctx.lineTo(-41, -5);
  ctx.lineTo(-7, -5);
  ctx.bezierCurveTo(2, -5, 2, 5, -7, 5);
  ctx.lineTo(-27, 5);
  ctx.bezierCurveTo(-15, 8, -21, 14, -27, 14);
  ctx.bezierCurveTo(-18, 17, -25, 22, -31, 22);
  ctx.bezierCurveTo(-24, 25, -34, 29, -41, 27);
  ctx.lineTo(-58, 21);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#bc8864';
  line(ctx, -20, -4, -20, 4);
  line(ctx, -37, 8, -28, 11);
  ctx.fillStyle = '#f5f9ff';
  ctx.fillRect(-65, 0, 9, 24);
  if (age >= hit.duration && retreat < .45) {
    ctx.strokeStyle = '#edaa58';
    line(ctx, 3, -9, 7, -13);
    line(ctx, 6, 0, 12, 0);
    line(ctx, 3, 9, 7, 13);
  }
  ctx.restore();
}

function draw(time) {
  raf = 0;
  const elapsed = lastDraw === null ? 0 : Math.min(.1, (time - lastDraw) / 1000);
  lastDraw = time;
  const active = displayFrame(elapsed);
  const surfaceState = surface(canvas);
  if (!surfaceState) return;
  const {ctx, width, height} = surfaceState;
  const cart = active?.points[0][0] ?? 0;
  const {reach, halfRail, railX: px, modelX, modelY: py} = railProjection(width, height, level, cart);
  const railY = py(0) + 16;
  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, '#ffffff');
  background.addColorStop(1, '#f0f5fa');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2 + panX, height / 2 + panY);
  ctx.scale(zoom, zoom);
  ctx.translate(-width / 2, -height / 2);

  ctx.lineCap = 'round';
  ctx.strokeStyle = '#d5e0ec';
  ctx.lineWidth = 27;
  line(ctx, px(-X_LIMIT), railY + 12, px(X_LIMIT), railY + 12);
  ctx.strokeStyle = '#8499ad';
  ctx.lineWidth = 3;
  line(ctx, px(-X_LIMIT), railY, px(X_LIMIT), railY);
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#536a80';
  const ticks = [-X_LIMIT, 0, X_LIMIT];
  for (const x of ticks) {
    line(ctx, px(x), railY + 7, px(x), railY + 11);
    ctx.fillText((x > 0 ? '+' : '') + x + 'm', px(x), railY + 40);
  }
  if (active) {
    const x = px(cart), y = py(0);
    const half = 24;
    if (showGuides) {
      ctx.strokeStyle = '#aebdcd';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      line(ctx, x, y, x, py(reach));
      ctx.setLineDash([]);
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
    for (let i = 1; i < active.points.length; i++) {
      const [a, b] = active.points[i - 1], [u, v] = active.points[i];
      const ax = modelX(a), ay = py(b), bx = modelX(u), by = py(v);
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
    for (const [u, v] of active.points) {
      circle(ctx, modelX(u), py(v), 4.8, '#27394b');
      circle(ctx, modelX(u), py(v), 2.8, '#d0dce7');
    }
    const tip = x + active.force / MAX_FORCE * 40;
    if (showGuides && Math.abs(tip - x) > 4) {
      ctx.strokeStyle = '#26746c';
      ctx.lineWidth = 2;
      const direction = Math.sign(tip - x);
      line(ctx, x, railY - 31, tip, railY - 31);
      line(ctx, tip, railY - 31, tip - direction * 5, railY - 35);
      line(ctx, tip, railY - 31, tip - direction * 5, railY - 27);
    }
  }

  if (active?.finger) drawFinger(ctx, active, modelX, py);
  ctx.restore();
  const updates = preview?.updates ?? 0;
  get('live').textContent = (modelPolicy ? '모델 실행' : '실시간 관찰') + ' · PPO ' + numeric.format(updates);
  get('time').textContent = format(active?.time ?? 0) + '초';
  get('hold').textContent = format(active?.streak ?? 0) + ' / ' + HOLD_SECONDS + '초';
  get('hold').style.color = active?.success ? '#19704a' : '';
  if (!document.hidden && (modelPolicy || ['running', 'complete'].includes(phase))) requestDraw();
}
function requestDraw() {
  if (!raf) raf = requestAnimationFrame(draw);
}

function plot() {
  const s = surface(chart);
  if (!s) return;
  const {ctx, width, height} = s, all = metrics?.history ?? [];
  const history = chartRange ? all.slice(-chartRange) : all;
  const rewards = history.map(row => row.reward);
  const roundTick = (range) => 10 ** Math.floor(Math.log10(range || 1));
  const offset = all.length - history.length;
  const average = history.map((_, i) => {
    const end = offset + i + 1;
    const window = all.slice(Math.max(0, end - 30), end);
    return window.reduce((sum, row) => sum + row.reward, 0) / window.length;
  });
  const low = Math.min(0, ...rewards, ...average), high = Math.max(1, ...rewards, ...average);
  const tick = roundTick((high - low) / 4);
  const min = Math.floor(low / tick) * tick, max = Math.ceil(high / tick) * tick;
  const labels = [max, (min + max) / 2, min].map(n => numeric.format(n));
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const axis = Math.ceil(Math.max(...labels.map(t => ctx.measureText(t).width))) + 11;
  const px = i => axis + i * (width - axis - 7) / Math.max(1, rewards.length - 1);
  const py = reward => 10 + (max - reward) / (max - min) * (height - 30);
  ctx.fillStyle = '#263c52';
  for (const [i, label] of labels.entries()) {
    const y = py(max - i * (max - min) / 2);
    ctx.strokeStyle = '#e0e8ef';
    line(ctx, axis - 4, y, width - 4, y);
    ctx.fillText(label, 2, y);
  }
  ctx.strokeStyle = '#aebdcd';
  line(ctx, axis, py(max), axis, py(min));
  ctx.fillText(numeric.format(history[0]?.episode ?? 0), axis, height - 8);
  if (!history.length) return;
  ctx.textAlign = 'right';
  if (history.length > 1) ctx.fillText(numeric.format(history.at(-1).episode), width - 4, height - 8);
  const series = [rewards, average];
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
  config = options({envs: get('env').value, seconds: get('seconds').value,
    impactEnabled: get('impact-enabled').checked,
    impactInterval: get('impact-interval').value,
    impactMin: get('impact-min').value, impactMax: get('impact-max').value});
  get('env').value = config.envs;
  get('seconds').value = config.seconds;
  saveSettings();
  worker?.postMessage({type: 'config', config});
}

get('env').value = config.envs;
get('seconds').value = config.seconds;
get('count').value = count;
get('env').onchange = get('seconds').onchange = configure;
get('impact-enabled').checked = config.impactEnabled;
get('impact-interval').value = config.impactInterval;
get('impact-min').value = config.impactMin;
get('impact-max').value = config.impactMax;
for (const name of ['impact-enabled', 'impact-interval', 'impact-min', 'impact-max']) {
  get(name).onchange = () => {
    configure();
    get('impact-interval').value = config.impactInterval;
    get('impact-min').value = config.impactMin;
    get('impact-max').value = config.impactMax;
  };
}
get('impact').onclick = () => {
  if (!modelPolicy) return;
  if (!preview || preview.done) displayFrame(0);
  preview.impact(config);
  requestDraw();
};
get('count').onchange = () => {
  count = episodeBudget(get('count').value);
  get('count').value = count;
  saveSettings();
  showStats();
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
  modelPolicy = modelPolicy ? null : latestPolicy;
  preview = lastDraw = null;
  controls();
  requestDraw();
};
get('reset').onclick = () => {
  if (!confirm('이 레벨의 학습과 기록을 초기화할까요? 완료된 정책은 복원용으로 한 번 보관합니다.')) return;
  if (lastCheckpoint && !write('backup' + level, lastCheckpoint)) return;
  if (write('level' + level, null)) {
    sync?.queue(level, null);
    openLevel(level);
  }
};
get('range').value = chartRange;
get('guides').checked = showGuides;
get('guides').onchange = () => {
  showGuides = get('guides').checked;
  saveSettings();
  requestDraw();
};
get('range').onchange = () => {
  chartRange = Number(get('range').value);
  saveSettings();
  plot();
};
new ResizeObserver(() => { requestDraw(); plot(); }).observe(canvas);
new ResizeObserver(plot).observe(chart);
const stage = canvas.closest('.cpe-stage');
const grid = stage.closest('.cpe-grid');
let layoutFrame = 0;
function fitDesktopVideo() {
  layoutFrame = 0;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) {
    grid.style.removeProperty('--stage-height');
    return;
  }
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const top = stage.getBoundingClientRect().top + window.scrollY;
  const stats = document.querySelector('.cpe-stats').getBoundingClientRect().height;
  const progress = document.querySelector('.cpe-progress').getBoundingClientRect().height;
  const bottomPadding = parseFloat(getComputedStyle(document.querySelector('.cpe-lab')).paddingBottom) || 0;
  const height = Math.max(100, Math.floor(viewportHeight - top - stats - progress - bottomPadding - 10));
  grid.style.setProperty('--stage-height', height + 'px');
}
function requestFit() {
  if (!layoutFrame) layoutFrame = requestAnimationFrame(fitDesktopVideo);
}
window.addEventListener('resize', requestFit);
window.visualViewport?.addEventListener('resize', requestFit);
const layoutObserver = new ResizeObserver(requestFit);
layoutObserver.observe(document.querySelector('.topbar'));
layoutObserver.observe(document.querySelector('.cpe-stats'));
layoutObserver.observe(document.querySelector('.cpe-progress'));
document.fonts?.ready.then(requestFit);
requestFit();
function touchGesture() {
  const points = [...pointers.values()];
  const center = {x: points.reduce((s,p)=>s+p.x,0)/points.length,
    y: points.reduce((s,p)=>s+p.y,0)/points.length};
  const distance = points.length > 1 ? Math.hypot(points[0].x-points[1].x, points[0].y-points[1].y) : 0;
  return {...center, distance};
}
canvas.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
  gesture = touchGesture();
});
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, {x:event.clientX,y:event.clientY});
  const next = touchGesture();
  panX += next.x-gesture.x;
  panY += next.y-gesture.y;
  if (next.distance && gesture.distance) zoom = Math.max(.15, Math.min(5, zoom*next.distance/gesture.distance));
  gesture = next;
  requestDraw();
});
for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name,event=>{
  pointers.delete(event.pointerId);
  gesture = pointers.size ? touchGesture() : null;
});
canvas.addEventListener('wheel',event=>{
  event.preventDefault();
  zoom = Math.max(.15,Math.min(5,zoom*Math.exp(-event.deltaY*.001)));
  requestDraw();
},{passive:false});
canvas.addEventListener('dblclick',()=>{zoom=1;panX=panY=0;requestDraw();});
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
async function connect() {
  syncing = true;
  const fragment = new URLSearchParams(location.hash.slice(1)).get('cartpole');
  let key;
  try { key = fragment || localStorage.getItem('mydesk.cartpole.connection') || localStorage.getItem('mydesk.mindmap.connection.v1'); } catch {}
  if (!/^[A-Za-z0-9_-]{43}$/.test(key || '')) {
    get('sync').textContent = '기기 연결 링크 필요';
    syncing = false;
    return;
  }
  const candidate = new CartSync({key});
  try {
    const rows = await candidate.load();
    for (const row of rows) {
      const pending = candidate.pending.get(row.id);
      const local = read('level' + row.id);
      if (pending) write('level' + row.id, pending.model);
      else if (row.model) write('level' + row.id, row.model);
      else if (local) candidate.queue(row.id, local);
      if (row.model?.milestone) unlocked = Math.max(unlocked, Math.min(5, row.id + 1));
    }
    await candidate.flush();
    localStorage.setItem('mydesk.cartpole.connection', key);
    if (fragment) history.replaceState(null, '', location.pathname + location.search);
    sync = candidate;
    get('sync').textContent = '웹 연결됨';
    openLevel(level);
  } catch (error) { get('sync').textContent = error.message; }
  finally { syncing = false; }
}
setInterval(async () => {
  if (!sync || syncing || document.hidden) return;
  syncing = true;
  try {
    if (sync.pending.size) {
      await sync.flush();
      get('sync').textContent = '웹에 저장됨';
    } else if (!['running', 'loading', 'evaluating'].includes(phase)) {
      const revision = sync.rows.get(level)?.revision;
      const rows = await sync.load();
      for (const row of rows) {
        write('level' + row.id, row.model);
        if (row.model?.milestone) unlocked = Math.max(unlocked, Math.min(5, row.id + 1));
      }
      if (sync.rows.get(level)?.revision !== revision) openLevel(level);
      showLevels();
    }
  } catch (error) {
    get('sync').textContent = error.message;
    if (error.message.includes('새로고침')) worker?.postMessage({type: 'pause'});
  } finally { syncing = false; }
}, 3000);
openLevel(level);
connect();
