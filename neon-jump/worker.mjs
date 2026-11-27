import { levelKey, loadLevels, observe } from './physics.mjs?v=2';
import { forward } from './dqn.mjs';
import { runPolicy, Training } from './training.mjs';
import { checkpoint, read } from './storage.mjs';

const levels = loadLevels();
const writer = crypto.randomUUID();
let session, level, key, primaryKey, epoch, revision, timer, mode = 'paused', saving, dirty = false;
let budget = 8, updateTime = 0, lastSave = 0, lastEpisode = 0, reportTime = 0, compute = 0;
let commands = Promise.resolve();
let hasConflict = false;
let runStart = 0, runTarget = 0, stopReason = null;

function send(type, info = {}) { postMessage({ type, epoch, ...info }); }
function publish() {
  if (!session) return;
  const now = performance.now();
  const episodeRate = reportTime ? (session.episode - lastEpisode) * 1000 / Math.max(1, now - reportTime) : 0;
  lastEpisode = session.episode;
  reportTime = now;
  const q = Array.from(forward(session.agent.weights, observe(level, session.state)).at(-1));
  send('status', { ...session.summary(), q, mode, episodeRate, compute, budget, hasConflict, runStart, runTarget, stopReason,
    preview: mode === 'training' ? session.agent.weights : undefined, onConflictBranch: key !== primaryKey });
}

async function save(reset = false) {
  if (saving) await saving;
  if (!session || (!dirty && !reset)) return;
  const pendingChanges = dirty;
  const snapshot = reset ? null : structuredClone(session.snapshot());
  dirty = false;
  saving = checkpoint(key, snapshot, revision, writer, primaryKey, reset).then(result => {
    revision = result.revision;
    if (result.branch) {
      key = result.branch;
      hasConflict = true;
      send('notice', { message: '다른 탭에서 먼저 저장했습니다. 이 탭의 학습은 별도 사본에 저장됩니다.' });
      publish();
    }
    if (result.conflict) {
      dirty ||= pendingChanges;
      send('notice', { message: '다른 탭의 학습 기록이 변경되어 초기화를 중단했습니다.' });
    }
    lastSave = performance.now();
    return !result.conflict;
  }).catch(() => {
    dirty = true;
    send('notice', { message: '브라우저 저장에 실패했습니다. 현재 탭에는 학습 상태가 남아 있습니다.' });
    return false;
  });
  try { return await saving; } finally { saving = null; }
}

function pause() {
  clearTimeout(timer);
  mode = 'paused';
}

async function recover(message) {
  pause();
  try {
    const current = await read(key);
    const backup = await read(key + ':backup');
    for (const snapshot of [current?.snapshot, backup]) {
      if (!snapshot) continue;
      try {
        session = new Training(level, 1, snapshot);
        revision = current?.revision ?? 0;
        dirty = false;
        send('notice', { message: message + ' 마지막 정상 체크포인트를 복원했습니다.' });
        publish();
        return;
      } catch { /* Try the preceding checkpoint. */ }
    }
  } catch { /* Leave the persisted data intact. */ }
  dirty = false;
  send('notice', { message: message + ' 복원 가능한 체크포인트가 없습니다.' });
  publish();
}

function loop() {
  if (mode !== 'training') return;
  const start = performance.now();
  try {
    do {
      session.tick();
      dirty = true;
    } while (!session.trained && session.episode < runTarget && performance.now() - start < budget);
    const finished = session.trained || session.episode >= runTarget;
    compute = performance.now() - start;
    if (start - updateTime >= 250 || finished) {
      if (finished) {
        stopReason = session.trained ? 'solved' : 'target';
        pause();
      }
      publish();
      updateTime = start;
    }
    if (finished || (start - lastSave > 10000 && !saving)) void save();
    if (mode === 'training') timer = setTimeout(loop, Math.max(0, Math.ceil(compute / (budget < 8 ? 2 : 5))));
  } catch (error) {
    void recover(error.message);
  }
}

async function handle(message) {
  if (message.type === 'load') {
    pause();
    if (dirty && await save() === false) {
      send('load-blocked', { requestedEpoch: message.epoch });
      return;
    }
    epoch = message.epoch;
    level = (await levels).find(entry => levelKey(entry) === message.level);
    if (!level) throw Error('스테이지를 찾을 수 없습니다.');
    primaryKey = key = 'ai:' + level.id + ':' + level.version;
    hasConflict = false;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    reportTime = 0;
    runStart = runTarget = 0;
    stopReason = null;
    lastSave = performance.now();
    dirty = false;
    session = new Training(level, seed);
    revision = 0;
    try {
      const previous = await read(key);
      hasConflict = !!await read(primaryKey + ':latest-conflict');
      revision = previous?.revision ?? 0;
      try {
        session = new Training(level, seed, previous?.snapshot);
      } catch {
        const backup = await read(key + ':backup');
        if (backup) session = new Training(level, seed, backup);
        send('notice', { message: backup ? '이전 정상 체크포인트를 복원했습니다.' : '저장된 체크포인트가 손상되었습니다.' });
      }
      const archivedBest = await read(key + ':best');
      if (archivedBest && (!session.best || archivedBest.progress > session.best.progress
        || (archivedBest.progress === session.best.progress && archivedBest.score > session.best.score))) {
        try { session = new Training(level, seed, { ...session.snapshot(), best: archivedBest }); }
        catch { send('notice', { message: '별도 저장된 최고 정책을 읽을 수 없습니다.' }); }
      }
    } catch {
      send('notice', { message: '저장소를 열거나 체크포인트를 복원할 수 없습니다.' });
    }
    publish();
    return;
  }
  if (!session || message.epoch !== epoch) return;
  switch (message.type) {
    case 'budget':
      budget = Math.max(3, Math.min(18, message.ms));
      break;
    case 'train':
      if (mode === 'training') break;
      if (message.continue) session.trained = false;
      if (session.trained) break;
      if (!message.resume || runTarget <= session.episode) {
        if (!Number.isInteger(message.count) || message.count < 1 || message.count > 100000) break;
        runStart = session.episode;
        runTarget = runStart + message.count;
      }
      stopReason = null;
      mode = 'training';
      reportTime = 0;
      updateTime = performance.now();
      publish();
      loop();
      break;
    case 'observe':
      pause();
      send('policy', { weights: message.best ? session.best?.weights : session.agent.weights });
      publish();
      await save();
      break;
    case 'pause':
      pause();
      publish();
      await save();
      break;
    case 'replay': {
      const replay = session.events[message.index]?.replay;
      if (replay) send('replay', { replay });
      break;
    }
    case 'benchmark': {
      const weights = session.best?.weights ?? session.agent.weights;
      const policy = runPolicy(level, weights);
      const random = Array.from({ length: 24 }, (_, seed) => runPolicy(level, null, { randomSeed: seed + 318 }));
      send('benchmark', { policy: policy.progress, randomAverage: random.reduce((sum, row) => sum + row.progress, 0) / random.length,
        randomBest: Math.max(...random.map(row => row.progress)), randomClears: random.filter(row => row.cleared).length, runs: random.length });
      break;
    }
    case 'transfer': {
      if (session.agent.decisions || session.episode || session.best || mode === 'training') break;
      const previous = (await levels).find(entry => levelKey(entry) === message.from);
      if (!previous || previous === level) break;
      const policy = await read('ai:' + previous.id + ':' + previous.version + ':best');
      if (!policy) {
        send('notice', { message: '선택한 스테이지에 보존된 정책이 없습니다.' });
        break;
      }
      const shape = session.agent.snapshot();
      session = new Training(level, 1, { ...session.snapshot(), agent: { ...shape, weights: policy.weights, target: policy.weights } });
      dirty = true;
      publish();
      await save();
      break;
    }
    case 'open-checkpoint': {
      pause();
      if (dirty && await save() === false) break;
      const target = message.branch ? await read(primaryKey + ':latest-conflict') : primaryKey;
      if (!target || target === key) { publish(); break; }
      const record = await read(target);
      const next = new Training(level, crypto.getRandomValues(new Uint32Array(1))[0], record?.snapshot);
      key = target;
      runStart = runTarget = 0;
      stopReason = null;
      session = next;
      revision = record?.revision ?? 0;
      dirty = false;
      reportTime = 0;
      publish();
      send('notice', { message: message.branch ? '보존된 충돌 사본을 열었습니다.' : '기본 체크포인트를 열었습니다.' });
      break;
    }
    case 'reset': {
      pause();
      if (await save(true)) {
        runStart = runTarget = 0;
        stopReason = null;
        session = new Training(level, crypto.getRandomValues(new Uint32Array(1))[0]);
        dirty = false;
      }
      publish();
      break;
    }
  }
}

self.onmessage = ({ data }) => {
  commands = commands.then(() => handle(data)).catch(error => {
    pause();
    send('notice', { message: error.message });
    publish();
  });
};
