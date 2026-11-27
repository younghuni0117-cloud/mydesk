import { advance, DECISION_STEPS, initialState, observe, PHYSICS_VERSION, progress, STEP } from './physics.mjs';
import { CONFIG, DQN, forward, greedy, randomSource, validWeights } from './dqn.mjs';
import { reward } from './reward.mjs';

export function runPolicy(level, weights, { offset = 0, randomSeed } = {}) {
  const rng = randomSeed === undefined ? null : randomSource(randomSeed);
  const state = initialState(level, offset);
  const actions = [];
  let score = 0;
  while (state.status === 'running') {
    const a = rng ? +(rng.next() < 0.5) : greedy(forward(weights, observe(level, state)).at(-1));
    const { x, grounded, tick } = state;
    advance(level, state, a);
    score += reward(level, x, state, a && grounded);
    if (a) actions.push(tick);
  }
  return { progress: progress(level, state), cleared: state.status === 'cleared', passed: state.passed,
    score, actions, offset, ticks: state.tick };
}

export function makeReplay(level, actions, ticks, offset = 0) {
  return { level: level.id, stageVersion: level.version, physicsVersion: PHYSICS_VERSION, step: STEP,
    actions: actions.slice(), ticks, offset };
}

export function compatible(level, replay) {
  return replay?.level === level.id && replay.stageVersion === level.version
    && replay.physicsVersion === PHYSICS_VERSION && replay.step === STEP;
}

const mean = rows => rows.length ? rows.reduce((sum, row) => sum + row.progress, 0) / rows.length : 0;

export class Training {
  constructor(level, seed, saved) {
    if (saved && (saved.version !== 1 || saved.levelVersion !== level.version || saved.physics !== PHYSICS_VERSION
      || (saved.best && !validWeights(saved.best.weights)))) throw Error('체크포인트 버전 또는 정책 오류');
    this.level = level;
    this.agent = new DQN(seed, saved?.agent);
    this.episode = saved?.episode ?? 0;
    this.history = saved?.history ?? [];
    this.events = saved?.events ?? [];
    this.milestones = saved?.milestones ?? [];
    this.maximum = saved?.maximum ?? 0;
    this.mostPassed = saved?.mostPassed ?? 0;
    this.cleared = saved?.cleared ?? false;
    this.best = saved?.best ?? null;
    this.evaluation = saved?.evaluation ?? null;
    this.recoveries = saved?.recoveries ?? 0;
    this.recovery = saved?.recovery ?? null;
    this.lastImprovement = saved?.lastImprovement ?? 0;
    this.trained = saved?.trained ?? false;
    this.resetAttempt();
    if (saved?.attempt) Object.assign(this, saved.attempt);
  }

  resetAttempt() {
    this.state = initialState(this.level);
    this.actions = [];
    this.score = 0;
  }

  event(kind, row) {
    this.events.push({ kind, episode: this.episode, progress: row.progress, score: row.score,
      time: Date.now(), policyVersion: this.agent.updates, stageVersion: this.level.version,
      replay: makeReplay(this.level, this.actions, this.state.tick) });
  }

  evaluate() {
    const weights = this.agent.weights;
    const fixed = runPolicy(this.level, weights);
    if (!this.best || fixed.progress > this.best.progress
      || (fixed.progress === this.best.progress && fixed.score > this.best.score)) {
      this.best = { progress: fixed.progress, score: fixed.score, weights: weights.slice(),
        policyVersion: this.agent.updates, replay: makeReplay(this.level, fixed.actions, fixed.ticks) };
    }
    if (this.cleared || fixed.cleared) {
      const offsets = [-8, -4, 4, 8];
      this.evaluation = { fixed: fixed.progress, cleared: fixed.cleared,
        policyVersion: this.agent.updates,
        robustness: offsets.map(offset => ({ offset, progress: runPolicy(this.level, weights, { offset }).progress })) };
    }
    if (fixed.cleared && this.agent.updates > 0 && !this.trained) {
      this.trained = true;
      this.event('고정 조건 평가 성공', fixed);
      this.events.at(-1).replay = makeReplay(this.level, fixed.actions, fixed.ticks);
    }
    return fixed;
  }

  diagnose(row) {
    if (this.recovery && this.episode >= this.recovery.end) {
      const result = this.evaluate();
      const improved = result.progress > this.recovery.progress || mean(this.history.slice(-50)) > this.recovery.average + 0.01;
      if (!improved && !this.trained) {
        this.agent = new DQN(1, this.recovery.agent);
      }
      this.event(improved || this.trained ? '자동 복구 후 개선' : '자동 복구 이전 학습 상태 복원', row);
      this.recovery = null;
      this.lastImprovement = this.episode;
    }
    if (this.recovery || this.episode - this.lastImprovement < 350 || this.trained) return;
    const windows = [this.history.slice(-100, -50), this.history.slice(-50)];
    if (windows[0].length < 50 || mean(windows[1]) > mean(windows[0]) + 0.01) {
      this.lastImprovement = this.episode;
      return;
    }
    if (this.recoveries >= 3) {
      if (this.recoveries === 3) {
        this.event('학습 정체 · 자동 복구 한도 도달', row);
        this.recoveries++;
      }
      return;
    }
    this.event('학습 정체 감지', row);
    const terminals = this.agent.replay.filter(t => t.done).length;
    const jumps = this.agent.replay.filter(t => t.a === 1).length;
    const hits = {};
    for (const { hit } of windows[1]) if (hit !== null) hits[hit + 1] = (hits[hit + 1] ?? 0) + 1;
    this.events.at(-1).diagnostic = { epsilon: row.epsilon, loss: row.loss, q: row.q,
      updates: row.updates, replay: this.agent.replay.length, terminals, jumps, hits,
      averages: windows.map(mean) };
    this.recovery = { end: this.episode + 100, progress: this.evaluate().progress,
      average: mean(windows[1]), agent: structuredClone(this.agent.snapshot()) };
    this.agent.explorationUntil = this.agent.decisions + 12000;
    this.recoveries++;
    this.event('자동 복구 · 탐색률 상향', row);
  }

  tick(continueAfterClear = false) {
    if (this.trained && !continueAfterClear) return;
    const { level, state, agent } = this;
    const s = observe(level, state);
    const a = agent.select(s);
    if (a) this.actions.push(state.tick);
    const { x, grounded } = state;
    advance(level, state, a);
    const r = reward(level, x, state, a && grounded);
    this.score += r;
    const done = state.status !== 'running';
    agent.remember({ s, a, r, next: observe(level, state), done });
    agent.optimize();
    if (!done) return;
    this.episode++;
    const row = { episode: this.episode, progress: progress(level, state), score: this.score,
      loss: agent.loss, epsilon: agent.epsilon, q: Array.from(forward(agent.weights, s).at(-1)),
      updates: agent.updates, hit: state.hit };
    const previous = this.maximum;
    this.maximum = Math.max(previous, row.progress);
    this.mostPassed = Math.max(this.mostPassed, state.passed);
    row.best = this.maximum;
    this.history.push(row);
    if (this.history.length > 1200) this.history.shift();
    row.average = mean(this.history.slice(-20));
    if (row.progress > previous) {
      this.event('최고 진행률 갱신', row);
      this.lastImprovement = this.episode;
    }
    const milestones = [['첫 장애물 통과', state.passed > 0], ...[25, 50, 75].map(n => [n + '% 최초 도달', row.progress >= n / 100]),
      ['첫 스테이지 클리어', state.status === 'cleared']];
    for (const [name, reached] of milestones) {
      if (reached && !this.milestones.includes(name)) {
        this.milestones.push(name);
        this.event(name, row);
      }
    }
    const firstClear = !this.cleared && state.status === 'cleared';
    this.cleared ||= state.status === 'cleared';
    if (firstClear || !this.best || this.episode % 25 === 0 || row.progress > previous) this.evaluate();
    this.diagnose(row);
    this.resetAttempt();
  }

  snapshot() {
    return { version: 1, levelVersion: this.level.version, physics: PHYSICS_VERSION,
      agent: this.agent.snapshot(), episode: this.episode, history: this.history, events: this.events,
      milestones: this.milestones, maximum: this.maximum, mostPassed: this.mostPassed,
      cleared: this.cleared, best: this.best, evaluation: this.evaluation, recoveries: this.recoveries,
      recovery: this.recovery, lastImprovement: this.lastImprovement, trained: this.trained,
      attempt: { state: this.state, actions: this.actions, score: this.score } };
  }

  summary() {
    return { episode: this.episode, state: this.state, maximum: this.maximum,
      mostPassed: this.mostPassed, cleared: this.cleared, average: mean(this.history.slice(-20)),
      history: this.history.slice(-150), events: this.events.map(({ replay, ...event }, index) => ({ ...event, index })),
      epsilon: this.agent.epsilon, loss: this.agent.loss, updates: this.agent.updates,
      replaySize: this.agent.replay.length, capacity: CONFIG.capacity, trained: this.trained,
      evaluation: this.evaluation, best: this.best?.progress ?? null };
  }
}

export const decisionsPerSecond = 1 / (STEP * DECISION_STEPS);
