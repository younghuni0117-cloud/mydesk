import { DT, MAX_STEPS, X_LIMIT, ANGLE_LIMIT, initialState, advance, failed, actionFor, PolicySearch } from './cartpole-core.mjs';
const get = id => document.getElementById(`cp-${id}`);
const section = document.getElementById('cartpole');
const canvas = get('canvas');
const ctx = canvas.getContext('2d');
let learner = new PolicySearch(), bestHuman = 0;
const storageKey = 'mydesk.cartpole.v1';
const finiteArray = a => Array.isArray(a) && a.length === 4 && a.every(Number.isFinite);
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && finiteArray(saved.weights) && finiteArray(saved.mean) && finiteArray(saved.spread)
    && saved.spread.every(v => v >= 0.08 && v < 1e6)
    && Number.isInteger(saved.generations) && saved.generations >= 0 && saved.generations < 1e9
    && Number.isInteger(saved.episodes) && saved.episodes >= 0 && saved.episodes < 1e12
    && Number.isFinite(saved.score) && saved.score >= 0 && saved.score <= MAX_STEPS) {
    for (const key of ['weights', 'mean', 'spread', 'generations', 'episodes', 'score']) learner[key] = saved[key];
    learner.history = Array.isArray(saved.history) ? saved.history.filter(v => Number.isFinite(v) && v >= 0 && v <= MAX_STEPS).slice(-60) : [];
    bestHuman = Number.isFinite(saved.bestHuman) ? Math.max(0, Math.min(MAX_STEPS, saved.bestHuman)) : 0;
  }
} catch { /* The game also works with unavailable or invalid local storage. */ }
function save() {
  try {
    const data = Object.fromEntries(['weights', 'mean', 'spread', 'generations', 'episodes', 'score', 'history'].map(key => [key, learner[key]]));
    localStorage.setItem(storageKey, JSON.stringify({ ...data, bestHuman }));
  } catch {
    section.querySelector('.cp-storage-note').textContent = '이 브라우저에서는 저장소를 사용할 수 없어, 카트폴 기록은 현재 탭에서만 유지됩니다.';
  }
}
let mode = 'human', state = initialState(), steps = 0, playing = false, ended = false;
let training = false, trainingToken = 0, observe = true;
let frame = null, lastTime = 0, accumulator = 0, roundWeights = [...learner.weights];
const keys = new Set(), pointers = new Map();
function message(text) { get('status').textContent = text; }
function clearInput() { keys.clear(); pointers.clear(); updateHeld(); }
function updateHeld() {
  get('left').classList.toggle('cp-held', keys.has('ArrowLeft') || [...pointers.values()].includes(-1));
  get('right').classList.toggle('cp-held', keys.has('ArrowRight') || [...pointers.values()].includes(1));
}
function humanAction() {
  const left = keys.has('ArrowLeft') || [...pointers.values()].includes(-1);
  const right = keys.has('ArrowRight') || [...pointers.values()].includes(1);
  return Number(right) - Number(left);
}
function updateStats() {
  get('time').innerHTML = (steps * DT).toFixed(1) + '<small>초</small>';
  get('best').innerHTML = (bestHuman * DT).toFixed(1) + '<small>초</small>';
  get('angle').innerHTML = (Math.abs(state[2]) * 180 / Math.PI).toFixed(1) + '<small>°</small>';
  get('progress').style.width = `${steps / MAX_STEPS * 100}%`;
  get('generations').textContent = `${learner.generations.toLocaleString()}세대`;
  get('episodes').textContent = `${learner.episodes.toLocaleString()}회`;
  get('evaluation').textContent = learner.generations ? `${(learner.score * DT).toFixed(1)}초` : '—';
  const history = learner.history;
  get('chart-line').setAttribute('d', history.map((v, i) => `${i ? 'L' : 'M'}${history.length > 1 ? i / (history.length - 1) * 300 : 0} ${58 - v / MAX_STEPS * 52}`).join(' '));
}
function draw() {
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * ratio)), height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  ctx.setTransform(width / 800, 0, 0, height / 370, 0, 0);
  ctx.clearRect(0, 0, 800, 370);
  const ground = 270, scale = 120, cartX = 400 + Math.max(-2.6, Math.min(2.6, state[0])) * scale;
  ctx.strokeStyle = '#dce4d1'; ctx.lineWidth = 1;
  for (let x = 40; x < 800; x += 40) { ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x, ground + 30); ctx.stroke(); }
  for (let y = 30; y <= ground + 30; y += 40) { ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(760, y); ctx.stroke(); }
  const left = 400 - X_LIMIT * scale, right = 400 + X_LIMIT * scale;
  ctx.fillStyle = '#e6c2a23a'; ctx.fillRect(40, 35, left - 40, ground + 5); ctx.fillRect(right, 35, 760 - right, ground + 5);
  ctx.setLineDash([5, 6]); ctx.strokeStyle = '#cfaa85';
  for (const x of [left, right]) { ctx.beginPath(); ctx.moveTo(x, 35); ctx.lineTo(x, ground + 30); ctx.stroke(); }
  ctx.setLineDash([]); ctx.strokeStyle = '#9aaa89'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(40, ground + 21); ctx.lineTo(760, ground + 21); ctx.stroke();
  ctx.fillStyle = '#8b987b'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('−2.4 m', left, ground + 53); ctx.fillText('0', 400, ground + 53); ctx.fillText('+2.4 m', right, ground + 53);
  const pivotY = ground - 22, length = 160;
  // The dotted guides show the two failure angles, relative to the cart.
  ctx.strokeStyle = '#c5cfb9'; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
  for (const angle of [-ANGLE_LIMIT, ANGLE_LIMIT]) {
    ctx.beginPath(); ctx.moveTo(cartX, pivotY); ctx.lineTo(cartX + Math.sin(angle) * length, pivotY - Math.cos(angle) * length); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = '#284f3d'; ctx.fillRect(cartX - 39, ground - 25, 78, 32);
  ctx.fillStyle = '#74956b'; ctx.fillRect(cartX - 28, ground - 18, 56, 4);
  ctx.fillStyle = '#264333';
  for (const offset of [-24, 24]) { ctx.beginPath(); ctx.arc(cartX + offset, ground + 10, 10, 0, Math.PI * 2); ctx.fill(); }
  const poleX = cartX + Math.sin(state[2]) * length, poleY = pivotY - Math.cos(state[2]) * length;
  ctx.lineCap = 'round'; ctx.strokeStyle = Math.abs(state[2]) > ANGLE_LIMIT * .75 ? '#c46a45' : '#e89955'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(cartX, pivotY); ctx.lineTo(poleX, poleY); ctx.stroke();
  ctx.fillStyle = '#fbf9ea'; ctx.beginPath(); ctx.arc(cartX, pivotY, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f9e2b4'; ctx.beginPath(); ctx.arc(poleX, poleY, 7, 0, Math.PI * 2); ctx.fill();
  const direction = playing ? (mode === 'ai' ? actionFor(roundWeights, state) : humanAction()) : 0;
  if (direction) { ctx.fillStyle = '#4e7657'; ctx.font = '25px sans-serif'; ctx.fillText(direction > 0 ? '→' : '←', cartX + direction * 76, ground - 2); }
  ctx.lineCap = 'butt';
}
function updateButton() {
  get('start').textContent = playing ? 'Ⅱ 일시정지' : ended ? '↻ 다시 도전' : mode === 'human' ? '▶ 균형 잡기 시작' : '▶ AI 움직임 관찰';
}
function pause() {
  playing = false; cancelAnimationFrame(frame); frame = null; clearInput(); updateButton(); draw();
}
function ready() {
  pause(); state = initialState(); steps = 0; ended = false; accumulator = 0; roundWeights = [...learner.weights];
  updateButton(); updateStats(); draw();
}
function finish(success) {
  playing = false; ended = true; cancelAnimationFrame(frame); clearInput();
  if (mode === 'human' && steps > bestHuman) { bestHuman = steps; save(); }
  get('stage-note').textContent = success ? '20초 성공! 균형을 지켜냈어요.' : Math.abs(state[0]) > X_LIMIT ? '카트가 경계를 벗어났어요.' : '막대가 12° 이상 기울었어요.';
  message(`${mode === 'human' ? '나의' : 'AI의'} 기록 ${(steps * DT).toFixed(1)}초 · ${steps}점. ${success ? '20초 도전 성공!' : '다시 도전해 보세요.'}`);
  updateButton(); updateStats(); draw();
}
function animate(time) {
  if (!playing) return;
  accumulator += Math.min((time - lastTime) / 1000, .1); lastTime = time;
  while (accumulator >= DT && playing) {
    const action = mode === 'ai' ? actionFor(roundWeights, state) : humanAction();
    state = advance(state, action); accumulator -= DT;
    if (failed(state)) finish(false);
    else { steps++; if (steps >= MAX_STEPS) finish(true); }
  }
  updateStats(); draw(); if (playing) frame = requestAnimationFrame(animate);
}
function play(focus = true) {
  if (ended) ready();
  playing = true; accumulator = 0; lastTime = performance.now(); updateButton();
  get('stage-note').textContent = mode === 'human' ? '← → 방향키 · 버튼을 길게 눌러도 좋아요.' : 'AI가 배운 전략으로 카트를 조종하고 있어요.';
  message(mode === 'human' ? '도전 중! 카트가 경계를 벗어나지 않도록 막대를 받쳐주세요.' : 'AI 관찰 중. 학습 전후 얼마나 오래 버티는지 비교해 보세요.');
  if (focus) canvas.focus({ preventScroll: true });
  frame = requestAnimationFrame(animate);
}
function stopTraining() {
  training = false; trainingToken++; get('train').textContent = learner.generations ? '✧ 30세대 더 학습하기' : '✧ 30세대 학습하기';
  get('training-note').textContent = learner.generations ? '학습 기록이 저장됐어요. AI 움직임을 관찰해 보세요.' : '초기 AI는 아직 균형을 잡는 법을 몰라요.';
}
function selectMode(next) {
  stopTraining(); mode = next; ready();
  for (const key of ['human', 'ai']) {
    get(key).classList.toggle('selected', key === mode); get(key).setAttribute('aria-pressed', String(key === mode));
    get(`${key}-panel`).hidden = key !== mode;
  }
  get('control-title').textContent = mode === 'human' ? '나의 균형 감각' : 'AI의 균형 수업';
  get('compare').hidden = mode !== 'human'; get('reset-ai').hidden = mode !== 'ai';
  get('stage-note').textContent = '조금 기울 때, 가볍게 받쳐주세요.';
  message(mode === 'human' ? '준비됐나요? 시작을 누르고 ← → 방향키로 균형을 잡아보세요.' : '학습 전 AI를 관찰하거나, 30세대 학습으로 균형 잡기를 가르쳐 보세요.');
}
get('human').onclick = () => selectMode('human'); get('ai').onclick = () => selectMode('ai'); get('compare').onclick = () => { selectMode('ai'); get('train').focus(); };
get('start').onclick = () => {
  if (playing) { observe = false; pause(); message('잠시 멈췄어요. 시작 버튼을 누르면 이어집니다.'); }
  else { observe = true; play(); }
};
get('restart').onclick = () => { stopTraining(); ready(); message('새로운 시작 조건으로 준비했어요. 시작 버튼을 눌러주세요.'); get('stage-note').textContent = '이번에는 조금 더 오래 버텨볼까요?'; };
get('train').onclick = async () => {
  if (training) { stopTraining(); message('학습을 멈췄어요. 지금까지 배운 전략은 유지됩니다.'); return; }
  const token = ++trainingToken; training = true; observe = true;
  get('train').textContent = 'Ⅱ 학습 멈추기'; get('training-note').textContent = '새로운 조종 전략들을 실험하고 있어요…';
  ready(); play(false);
  for (let i = 0; i < 30 && token === trainingToken; i++) {
    // Give the browser time to paint and handle stop/mode changes between generations.
    await new Promise(resolve => setTimeout(resolve, 70));
    if (token !== trainingToken) return;
    learner.trainGeneration(); save(); updateStats();
    get('training-note').textContent = `${i + 1}/30세대 진행 · 후보 전략마다 3번씩 균형을 평가합니다.`;
    if (!playing && observe) { ready(); play(false); }
  }
  if (token !== trainingToken) return;
  stopTraining();
  if (observe) { ready(); play(false); }
  message('30세대 학습 완료! 새로 배운 전략으로 AI가 균형을 잡습니다.');
};
get('reset-ai').onclick = () => { stopTraining(); learner = new PolicySearch(); save(); ready(); get('train').textContent = '✧ 30세대 학습하기'; get('training-note').textContent = '초기 AI는 아직 균형을 잡는 법을 몰라요.'; message('AI 학습을 초기화했어요. 내 최고 기록은 유지됩니다.'); };
for (const [id, direction] of [['left', -1], ['right', 1]]) {
  const button = get(id);
  button.addEventListener('pointerdown', event => {
    if (mode !== 'human' || !playing) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId); pointers.set(event.pointerId, direction); updateHeld();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, event => { pointers.delete(event.pointerId); updateHeld(); });
}
document.addEventListener('keydown', event => {
  if (mode !== 'human' || !playing || !section.contains(event.target) || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault(); keys.add(event.key); updateHeld();
});
document.addEventListener('keyup', event => { keys.delete(event.key); updateHeld(); });
window.addEventListener('blur', () => { clearInput(); if (playing) { pause(); message('창을 벗어나 잠시 멈췄어요. 시작 버튼으로 이어가세요.'); } });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopTraining(); if (playing) { pause(); message('화면을 벗어나 잠시 멈췄어요. 시작 버튼으로 이어가세요.'); } }
});
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(draw).observe(canvas);
else window.addEventListener('resize', draw);
updateStats(); updateButton(); draw();
