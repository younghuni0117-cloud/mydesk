import { DT, MAX_STEPS, X_LIMIT, DIFFICULTIES, environment, initialState, advance, failed, actionFor, evaluatePolicy, PolicySearch } from './cartpole-core.mjs';
const get = id => document.getElementById(`cp-${id}`);
const section = document.getElementById('cartpole'), canvas = get('canvas'), ctx = canvas.getContext('2d');
const fields = ['weights', 'mean', 'spread', 'generations', 'episodes', 'modelGeneration', 'modelAttempts', 'pending', 'score', 'success', 'history'];
let difficulty = 'normal';
try { const last = localStorage.getItem('mydesk.cartpole.difficulty'); if (DIFFICULTIES[last]) difficulty = last; } catch {}
let config = environment(difficulty), learner, bestHuman = 0;
let mode = 'ai', state, steps = 0, playing = false, ended = false, roundStarted = false;
let training = false, currentJob = null, frame = null, lastTime = 0, accumulator = 0, roundWeights = [], roundAttempts = 0;
const keys = new Set(), pointers = new Map();
function validArray(a, n) { return Array.isArray(a) && a.length === n && a.every(v => Number.isFinite(v) && Math.abs(v) < 1e6); }
function validProfile(saved) {
  return saved && ['weights', 'mean', 'spread'].every(k => validArray(saved[k], config.dimension))
    && saved.spread.every(v => v >= .08) && Number.isInteger(saved.generations) && saved.generations >= 0 && saved.generations < 1e9
    && Number.isInteger(saved.episodes) && saved.episodes >= 0 && saved.episodes < 1e12;
}
function validPending(p) {
  const size = config.poles === 2 ? 49 : 25;
  return p && Array.isArray(p.candidates) && p.candidates.length === size && p.candidates.every(a => validArray(a, config.dimension))
    && Array.isArray(p.starts) && p.starts.length === 3 && p.starts.every(a => validArray(a, config.dimension))
    && Number.isInteger(p.candidateIndex) && p.candidateIndex >= 0 && p.candidateIndex < size
    && Number.isInteger(p.trialIndex) && p.trialIndex >= 0 && p.trialIndex < 3
    && Number.isFinite(p.partialScore) && p.partialScore >= 0 && p.partialScore <= p.trialIndex * MAX_STEPS
    && Array.isArray(p.ranked) && p.ranked.length === p.candidateIndex
    && p.ranked.every(v => v && validArray(v.weights, config.dimension) && Number.isFinite(v.score) && v.score >= 0 && v.score <= MAX_STEPS);
}
function load() {
  learner = new PolicySearch(Math.random, config); bestHuman = 0;
  try {
    const raw = localStorage.getItem(`mydesk.cartpole.v2.${difficulty}`);
    const saved = JSON.parse(raw || (difficulty === 'normal' ? localStorage.getItem('mydesk.cartpole.v1') : null));
    if (validProfile(saved)) {
      for (const k of ['weights', 'mean', 'spread', 'generations', 'episodes']) learner[k] = Array.isArray(saved[k]) ? [...saved[k]] : saved[k];
      learner.modelGeneration = Number.isInteger(saved.modelGeneration) && saved.modelGeneration >= 0 && saved.modelGeneration <= learner.generations ? saved.modelGeneration : learner.generations;
      const batchSize = config.poles === 2 ? 147 : 75;
      learner.modelAttempts = Number.isInteger(saved.modelAttempts) && saved.modelAttempts >= 0 && saved.modelAttempts <= learner.episodes ? saved.modelAttempts : Math.min(learner.episodes, learner.modelGeneration * batchSize);
      learner.pending = validPending(saved.pending) ? saved.pending : null;
      const evaluation = evaluatePolicy(learner.weights, config); learner.score = evaluation.mean; learner.success = evaluation.success;
      learner.history = raw && Array.isArray(saved.history) ? saved.history.filter(v => v && Number.isInteger(v.generation) && v.generation >= 0 && v.generation <= learner.generations && ['evaluation', 'best'].every(k => Number.isFinite(v[k]) && v[k] >= 0 && v[k] <= MAX_STEPS)).slice(-120).map(v => ({...v, attempts: Number.isInteger(v.attempts) && v.attempts >= 0 && v.attempts <= learner.episodes ? v.attempts : Math.min(learner.episodes, v.generation * batchSize)})) : [];
      if (!learner.history.length) learner.history = [{ generation: learner.generations, attempts: learner.episodes, evaluation: learner.score, best: learner.score, success: learner.success }];
      bestHuman = Number.isFinite(saved.bestHuman) ? Math.max(0, Math.min(MAX_STEPS, saved.bestHuman)) : 0;
      if (learner.pending) learner.checkpoint();
    }
  } catch { /* Missing or corrupt storage starts a fresh model for this difficulty. */ }
}
function save() {
  try {
    localStorage.setItem(`mydesk.cartpole.v2.${difficulty}`, JSON.stringify({ ...Object.fromEntries(fields.map(k => [k, learner[k]])), bestHuman }));
    localStorage.setItem('mydesk.cartpole.difficulty', difficulty);
  } catch {
    const note = document.querySelector('.cp-storage-note');
    if (note) note.textContent = '저장소를 사용할 수 없어 현재 탭에서만 모델과 기록이 유지됩니다.';
  }
}
function message(text) { get('status').textContent = text; }
function clearInput() { keys.clear(); pointers.clear(); updateHeld(); }
function updateHeld() {
  get('left').classList.toggle('cp-held', keys.has('ArrowLeft') || [...pointers.values()].includes(-1));
  get('right').classList.toggle('cp-held', keys.has('ArrowRight') || [...pointers.values()].includes(1));
}
function humanAction() { return Number(keys.has('ArrowRight') || [...pointers.values()].includes(1)) - Number(keys.has('ArrowLeft') || [...pointers.values()].includes(-1)); }
function updateStats() {
  get('time').innerHTML = (steps * DT).toFixed(1) + '<small>초</small>';
  get('best').innerHTML = (bestHuman * DT).toFixed(1) + '<small>초</small>';
  const angle = Math.max(Math.abs(state[2]), config.poles === 2 ? Math.abs(state[4]) : 0);
  get('angle').innerHTML = (angle * 180 / Math.PI).toFixed(1) + '<small>°</small>';
  get('progress').style.width = `${steps / MAX_STEPS * 100}%`;
}
function updateLearning() {
  get('generations').textContent = `${learner.episodes.toLocaleString()}회`;
  get('episodes').textContent = '성능 평가 8회 별도';
  get('evaluation').textContent = learner.episodes ? `${(learner.score * DT).toFixed(1)}초` : '—';
  get('success').textContent = learner.episodes ? `${Math.round(learner.success * 100)}%` : '—';
  get('model-status').textContent = learner.episodes ? `보존 모델 ${learner.modelAttempts.toLocaleString()}회 시점 · ${config.label} · 평균 ${(learner.score * DT).toFixed(1)}초` : '저장된 모델이 없습니다. 학습을 먼저 시작하세요.';
  const history = learner.history, first = history[0].attempts, last = history.at(-1).attempts;
  const point = (v, key) => [last === first ? 0 : (v.attempts - first) / (last - first) * 300, 99 - v[key] / MAX_STEPS * 98];
  for (const [id, key] of [['chart-line', 'best'], ['evaluation-line', 'evaluation']]) get(id).setAttribute('d', history.map((v, i) => `${i ? 'L' : 'M'}${point(v, key).join(' ')}`).join(' '));
  const [cx, cy] = point(history.at(-1), 'best'); get('chart-point').setAttribute('cx', cx); get('chart-point').setAttribute('cy', cy);
  get('graph-first').textContent = `${first.toLocaleString()}회`; get('graph-last').textContent = `${last.toLocaleString()}회`;
  get('performance-chart').setAttribute('aria-label', `${config.label}. ${first}~${last}회 학습 시도 구간의 평균 생존 시간. 최고 모델 ${(learner.score * DT).toFixed(1)}초, 20초 성공률 ${Math.round(learner.success * 100)}%. 같은 8개 조건 평가.`);
  updateButtons();
}
function draw() {
  if (!ctx || !state) return;
  const rect = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * ratio)), height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height);
  const scaleToFit = Math.min(width / 800, height / 370);
  ctx.setTransform(scaleToFit, 0, 0, scaleToFit, (width - 800 * scaleToFit) / 2, (height - 370 * scaleToFit) / 2);
  const ground = 270, scale = 120, cartX = 400 + Math.max(-2.6, Math.min(2.6, state[0])) * scale;
  ctx.strokeStyle = '#dce4ed'; ctx.lineWidth = 1;
  for (let x = 40; x < 800; x += 40) { ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x, ground + 30); ctx.stroke(); }
  for (let y = 30; y <= ground + 30; y += 40) { ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(760, y); ctx.stroke(); }
  const left = 400 - X_LIMIT * scale, right = 400 + X_LIMIT * scale;
  ctx.fillStyle = '#e6c2a23a'; ctx.fillRect(40, 30, left - 40, ground + 10); ctx.fillRect(right, 30, 760 - right, ground + 10);
  ctx.setLineDash([5, 6]); ctx.strokeStyle = '#cfaa85';
  for (const x of [left, right]) { ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x, ground + 30); ctx.stroke(); }
  ctx.setLineDash([]); ctx.strokeStyle = '#99abc2'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(40, ground + 21); ctx.lineTo(760, ground + 21); ctx.stroke();
  ctx.fillStyle = '#8899b0'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('−2.4 m', left, ground + 53); ctx.fillText('0', 400, ground + 53); ctx.fillText('+2.4 m', right, ground + 53);
  ctx.fillStyle = '#456080'; ctx.fillRect(cartX - 39, ground - 25, 78, 32);
  ctx.fillStyle = '#829ab7'; ctx.fillRect(cartX - 28, ground - 18, 56, 4);
  ctx.fillStyle = '#314966';
  for (const offset of [-24, 24]) { ctx.beginPath(); ctx.arc(cartX + offset, ground + 10, 10, 0, Math.PI * 2); ctx.fill(); }
  let pivotX = cartX, pivotY = ground - 22;
  const lengths = config.poles === 2 ? [110, 110 * config.secondLength / config.length] : [difficulty === 'easy' ? 185 : difficulty === 'hard' ? 125 : 160];
  for (let i = 0; i < config.poles; i++) {
    const angle = state[2 + i * 2], length = lengths[i];
    ctx.strokeStyle = '#c5cfdd'; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
    for (const limit of [-config.angleLimit, config.angleLimit]) { ctx.beginPath(); ctx.moveTo(pivotX, pivotY); ctx.lineTo(pivotX + Math.sin(limit) * length, pivotY - Math.cos(limit) * length); ctx.stroke(); }
    ctx.setLineDash([]);
    const x = pivotX + Math.sin(angle) * length, y = pivotY - Math.cos(angle) * length;
    ctx.lineCap = 'round'; ctx.strokeStyle = Math.abs(angle) > config.angleLimit * .75 ? '#c46a45' : i === 0 ? '#dd985a' : '#8299c5'; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(pivotX, pivotY); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = '#fbf9ea'; ctx.beginPath(); ctx.arc(pivotX, pivotY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = i === 0 ? '#f3d9b3' : '#dbe5f7'; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    pivotX = x; pivotY = y;
  }
  const direction = playing ? (mode === 'ai' ? actionFor(roundWeights, state, config) : humanAction()) : 0;
  if (Math.abs(direction) > .05) { ctx.fillStyle = '#58789b'; ctx.font = '25px sans-serif'; ctx.fillText(direction > 0 ? '→' : '←', cartX + Math.sign(direction) * 76, ground - 2); }
  ctx.lineCap = 'butt';
}
function updateButtons() {
  get('start').textContent = playing && mode === 'human' ? 'Ⅱ 일시정지' : ended ? '↻ 다시 도전' : '▶ 균형 잡기 시작';
  get('run-model').disabled = training || !learner.episodes;
  get('run-model').textContent = playing && mode === 'ai' ? 'Ⅱ 실행 일시정지' : roundStarted && !ended && mode === 'ai' ? '▶ 모델 이어 실행' : '▶ 학습 모델 실행';
  get('train').textContent = training ? 'Ⅱ 중지' : '학습 시작';
  get('attempts').disabled = training;
}
function pause() { playing = false; cancelAnimationFrame(frame); frame = null; clearInput(); updateButtons(); draw(); }
function ready() {
  pause(); state = initialState(Math.random, config); steps = 0; ended = false; roundStarted = false; accumulator = 0;
  roundWeights = [...learner.weights]; roundAttempts = learner.modelAttempts;
  updateButtons(); updateStats(); draw();
}
function finish(success) {
  playing = false; ended = true; clearInput();
  if (mode === 'human' && steps > bestHuman) { bestHuman = steps; save(); }
  message(`${config.label} · ${mode === 'human' ? '나의' : `${roundAttempts}회 시점 모델`} 기록 ${(steps * DT).toFixed(1)}초 · ${steps}점. ${success ? '20초 성공!' : '경계 또는 기울기 한도에 도달했어요.'}`);
  updateButtons(); updateStats(); draw();
}
function animate(time) {
  if (!playing) return;
  accumulator += Math.min((time - lastTime) / 1000, .1); lastTime = time;
  while (accumulator >= DT && playing) {
    state = advance(state, mode === 'ai' ? actionFor(roundWeights, state, config) : humanAction(), config); accumulator -= DT;
    if (failed(state, config)) finish(false); else { steps++; if (steps >= MAX_STEPS) finish(true); }
  }
  updateStats(); draw(); if (playing) frame = requestAnimationFrame(animate);
}
function play() {
  if (ended) ready();
  playing = true; roundStarted = true; accumulator = 0; lastTime = performance.now(); updateButtons();
  message(mode === 'human' ? `${config.label} · ← → 또는 터치 버튼으로 균형을 잡으세요.` : `${config.label} · 보존된 ${roundAttempts}회 시점 모델 실행 중. 실행 중에는 학습하지 않습니다.`);
  canvas.focus({ preventScroll: true }); frame = requestAnimationFrame(animate);
}
function stopTraining() {
  if (currentJob) { currentJob.cancelled = true; learner.checkpoint(); save(); currentJob = null; }
  training = false; updateButtons();
}
function selectMode(next) {
  stopTraining(); mode = next; section.dataset.mode = mode; ready(); updateLearning();
  for (const key of ['human', 'ai']) { get(key).classList.toggle('selected', key === mode); get(key).setAttribute('aria-pressed', String(key === mode)); get(`${key}-panel`).hidden = key !== mode; }
  message(mode === 'human' ? `${config.label} · 직접 도전 준비. 20초를 버텨보세요.` : learner.episodes ? '학습 모델 실행을 누르면 보존된 최고 모델로 시작합니다.' : '원하는 학습 시도 횟수를 입력하고 학습 시작을 눌러주세요.');
}
get('human').onclick = () => selectMode('human'); get('ai').onclick = () => selectMode('ai');
get('start').onclick = () => { if (playing) { pause(); message('잠시 멈췄어요. 시작 버튼으로 이어가세요.'); } else play(); };
get('run-model').onclick = () => {
  if (training || !learner.episodes) return;
  if (playing) { pause(); message('모델 실행을 멈췄어요. 이어 실행할 수 있습니다.'); }
  else { if (roundAttempts !== learner.modelAttempts) ready(); play(); }
};
get('restart').onclick = () => { stopTraining(); ready(); message('새 시작 조건으로 준비했어요. 실행 버튼을 눌러주세요.'); };
get('difficulty').onchange = () => {
  stopTraining(); pause(); difficulty = DIFFICULTIES[get('difficulty').value] ? get('difficulty').value : 'normal'; config = environment(difficulty);
  load(); state = initialState(Math.random, config); save(); get('environment-label').textContent = config.label;
  get('angle-label').textContent = config.poles === 2 ? '두 막대 최대 기울기' : '막대 기울기';
  canvas.setAttribute('aria-label', `${config.label} 카트폴. 카트 좌우 조작, 각 막대 수직 기준 ±${Math.round(config.angleLimit * 180 / Math.PI)}도 또는 카트 ±2.4m 이탈 시 종료.`);
  selectMode(mode); updateLearning();
};
get('attempts').oninput = () => get('attempts').setCustomValidity('');
get('train').onclick = async () => {
  if (training) {
    const job = currentJob;
    stopTraining(); ready(); updateLearning();
    message(`학습 중지. 이번 요청 ${job.completed.toLocaleString()}/${job.target.toLocaleString()}회 완료 · 누적 ${learner.episodes.toLocaleString()}회. 완료된 시도와 모델이 저장됐습니다.`);
    return;
  }
  const target = Number(get('attempts').value);
  get('attempts').setCustomValidity('');
  if (!Number.isInteger(target) || target < 1 || target > 10000) {
    get('attempts').setCustomValidity('1부터 10,000까지의 정수로 입력해 주세요.'); get('attempts').reportValidity(); return;
  }
  if (mode !== 'ai') selectMode('ai');
  ready(); training = true;
  const job = { learner, target, completed: 0, cancelled: false }; currentJob = job; updateButtons();
  get('attempts').blur();
  const yieldControl = () => new Promise(resolve => setTimeout(resolve, 0));
  const result = await learner.trainAttemptsAsync(target, yieldControl, () => currentJob === job && !job.cancelled, completed => {
    if (currentJob !== job) return;
    job.completed = completed; updateLearning();
    message(`${config.label} · 이번 학습 ${completed.toLocaleString()}/${target.toLocaleString()}회 · 누적 ${learner.episodes.toLocaleString()}회. 성능 평가 횟수는 별도입니다.`);
    get('training-note').textContent = `게임 시도 ${completed.toLocaleString()}/${target.toLocaleString()}회 완료`;
    if (completed % 15 === 0) save();
  });
  if (currentJob !== job) return;
  currentJob = null; training = false; save(); ready(); updateLearning();
  get('training-note').textContent = `요청한 ${result.completed.toLocaleString()}회 학습 완료. 학습 모델을 실행해 보세요.`;
  message(`학습 시도 ${result.completed.toLocaleString()}회 완료! 누적 ${learner.episodes.toLocaleString()}회 · 검증 평균 ${(learner.score * DT).toFixed(1)}초. ‘학습 모델 실행’을 눌러주세요.`);
};
get('reset-ai').onclick = () => {
  stopTraining(); learner = new PolicySearch(Math.random, config); save(); ready(); updateLearning();
  get('training-note').textContent = '현재 난이도의 모델과 그래프를 초기화했어요.'; message(`${config.label} 학습만 초기화했습니다. 다른 난이도와 내 최고 기록은 유지됩니다.`);
};
for (const [id, direction] of [['left', -1], ['right', 1]]) {
  const button = get(id);
  button.addEventListener('pointerdown', event => { if (mode !== 'human' || !playing) return; event.preventDefault(); button.setPointerCapture(event.pointerId); pointers.set(event.pointerId, direction); updateHeld(); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, event => { pointers.delete(event.pointerId); updateHeld(); });
}
document.addEventListener('keydown', event => {
  if (mode !== 'human' || !playing || !section.contains(event.target) || !['ArrowLeft', 'ArrowRight'].includes(event.key) || event.target.tagName === 'SELECT') return;
  event.preventDefault(); keys.add(event.key); updateHeld();
});
document.addEventListener('keyup', event => { keys.delete(event.key); updateHeld(); });
window.addEventListener('blur', () => { clearInput(); if (playing) { pause(); message('창을 벗어나 실행을 멈췄어요. 버튼으로 이어가세요.'); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopTraining(); pause(); message('화면을 벗어나 학습·실행을 멈췄어요. 버튼으로 다시 시작할 수 있습니다.'); } });
document.addEventListener('game:help-open', () => { stopTraining(); pause(); });
load(); state = initialState(Math.random, config); roundWeights = [...learner.weights]; roundAttempts = learner.modelAttempts;
get('difficulty').value = difficulty; get('environment-label').textContent = config.label; get('angle-label').textContent = config.poles === 2 ? '두 막대 최대 기울기' : '막대 기울기';
canvas.setAttribute('aria-label', `${config.label} 카트폴. 각 막대 수직 기준 ±${Math.round(config.angleLimit * 180 / Math.PI)}도 또는 카트 ±2.4m 이탈 시 종료.`);
selectMode('ai'); updateLearning();
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(draw).observe(canvas); else window.addEventListener('resize', draw);
