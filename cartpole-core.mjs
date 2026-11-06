// Cart-pole physics and cross-entropy policy search. Angles are measured from upright.
export const DT = 0.02;
export const MAX_STEPS = 1000;
export const X_LIMIT = 2.4;
export const ANGLE_LIMIT = 12 * Math.PI / 180;
export const DIFFICULTIES = Object.freeze({
  easy: { id: 'easy', label: '쉬움 · 긴 막대', poles: 1, length: .75, gravity: 9.8, force: 10, angleLimit: 20 * Math.PI / 180, initial: .025, dimension: 4 },
  normal: { id: 'normal', label: '기본 · 1단', poles: 1, length: .5, gravity: 9.8, force: 10, angleLimit: ANGLE_LIMIT, initial: .04, dimension: 4 },
  hard: { id: 'hard', label: '어려움 · 짧은 막대', poles: 1, length: .3, gravity: 11, force: 9, angleLimit: 10 * Math.PI / 180, initial: .06, dimension: 4 },
  double: { id: 'double', label: '도전 · 2단 관절', poles: 2, length: .7, secondLength: .6, gravity: 9.8, force: 14, angleLimit: 20 * Math.PI / 180, initial: .02, dimension: 6 },
});
export function environment(value = 'normal') { return typeof value === 'string' ? DIFFICULTIES[value] || DIFFICULTIES.normal : value; }
export function initialState(random = Math.random, difficulty = 'normal') {
  const config = environment(difficulty);
  return Array.from({ length: config.dimension }, () => (random() * 2 - 1) * config.initial);
}
function singleStep(state, action, config) {
  const [x, velocity, angle, angularVelocity] = state;
  const sin = Math.sin(angle), cos = Math.cos(angle), length = config.length;
  const temp = (Math.max(-1, Math.min(1, action)) * config.force + .1 * length * angularVelocity ** 2 * sin) / 1.1;
  const angularAcceleration = (config.gravity * sin - cos * temp) / (length * (4 / 3 - .1 * cos ** 2 / 1.1));
  const acceleration = temp - .1 * length * angularAcceleration * cos / 1.1;
  return [x + DT * velocity, velocity + DT * acceleration, angle + DT * angularVelocity, angularVelocity + DT * angularAcceleration];
}
// Two uniform rods connected in series. The 3x3 coupled mass matrix is solved
// at each substep; the second pole has its own absolute angle and velocity.
function doubleAcceleration(s, action, config) {
  const [, v, t1, w1, t2, w2] = s;
  const m1 = .12, m2 = .1, l1 = config.length, l2 = config.secondLength;
  const A = (m1 / 2 + m2) * l1, B = m2 * l2 / 2, C = m2 * l1 * l2 / 2;
  const a = 1 + m1 + m2, b = A * Math.cos(t1), c = B * Math.cos(t2);
  const d = (m1 / 3 + m2) * l1 * l1, e = C * Math.cos(t1 - t2), f = m2 * l2 * l2 / 3;
  const r0 = Math.max(-1, Math.min(1, action)) * config.force + A * Math.sin(t1) * w1 * w1 + B * Math.sin(t2) * w2 * w2 - .02 * v;
  const r1 = A * config.gravity * Math.sin(t1) - C * Math.sin(t1 - t2) * w2 * w2 - .001 * w1;
  const r2 = B * config.gravity * Math.sin(t2) + C * Math.sin(t1 - t2) * w1 * w1 - .001 * w2;
  const aa = d * f - e * e, ab = c * e - b * f, ac = b * e - c * d;
  const dd = a * f - c * c, de = b * c - a * e, ff = a * d - b * b;
  const det = a * aa + b * ab + c * ac;
  return [(aa * r0 + ab * r1 + ac * r2) / det, (ab * r0 + dd * r1 + de * r2) / det, (ac * r0 + de * r1 + ff * r2) / det];
}
function doubleStep(state, action, config) {
  // Midpoint integration, two 0.01s substeps, for the coupled dynamics.
  let s = state;
  const h = DT / 2;
  for (let n = 0; n < 2; n++) {
    const a = doubleAcceleration(s, action, config);
    const mid = [s[0] + h / 2 * s[1], s[1] + h / 2 * a[0], s[2] + h / 2 * s[3], s[3] + h / 2 * a[1], s[4] + h / 2 * s[5], s[5] + h / 2 * a[2]];
    const b = doubleAcceleration(mid, action, config);
    s = [s[0] + h * mid[1], s[1] + h * b[0], s[2] + h * mid[3], s[3] + h * b[1], s[4] + h * mid[5], s[5] + h * b[2]];
  }
  return s;
}
export function advance(state, action, difficulty = 'normal') {
  const config = environment(difficulty);
  return config.poles === 2 ? doubleStep(state, action, config) : singleStep(state, action, config);
}
export function failed(state, difficulty = 'normal') {
  const config = environment(difficulty);
  return state.length !== config.dimension || state.some(v => !Number.isFinite(v)) || Math.abs(state[0]) > X_LIMIT
    || Math.abs(state[2]) > config.angleLimit || (config.poles === 2 && Math.abs(state[4]) > config.angleLimit);
}
export function actionFor(weights, state, difficulty = 'normal') {
  const config = environment(difficulty), scales = config.poles === 2 ? [.3, .5, 8, 1.5, 8, 1.5] : [.5, .6, 6, 1.5];
  const sum = weights.reduce((total, w, i) => total + w * state[i] * scales[i], 0);
  return config.poles === 2 ? Math.tanh(sum) : sum >= 0 ? 1 : -1;
}
export function rollout(weights, start, difficulty = 'normal') {
  const config = environment(difficulty);
  let state = [...start], steps = 0;
  while (steps < MAX_STEPS) {
    state = advance(state, actionFor(weights, state, config), config);
    if (failed(state, config)) break;
    steps++;
  }
  return steps;
}
function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
export function evaluationStarts(difficulty = 'normal') {
  const config = environment(difficulty), random = seeded(9147 + Object.keys(DIFFICULTIES).indexOf(config.id));
  return Array.from({ length: 8 }, () => initialState(random, config));
}
export function evaluatePolicy(weights, difficulty = 'normal') {
  const scores = evaluationStarts(difficulty).map(s => rollout(weights, s, difficulty));
  return { mean: scores.reduce((a, b) => a + b, 0) / scores.length, success: scores.filter(v => v === MAX_STEPS).length / scores.length };
}
function gaussian(random) { return Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random()); }
export class PolicySearch {
  constructor(random = Math.random, difficulty = 'normal') {
    this.random = random; this.config = environment(difficulty);
    this.mean = Array(this.config.dimension).fill(0);
    this.spread = Array(this.config.dimension).fill(this.config.poles === 2 ? 3 : 1);
    this.weights = Array(this.config.dimension).fill(0);
    this.generations = 0; this.episodes = 0; this.modelGeneration = 0; this.modelAttempts = 0; this.pending = null;
    const baseline = evaluatePolicy(this.weights, this.config);
    this.score = baseline.mean; this.success = baseline.success;
    this.history = [{ generation: 0, attempts: 0, evaluation: this.score, best: this.score, success: this.success }];
  }
  candidates() {
    const size = this.config.poles === 2 ? 48 : 24;
    const candidates = Array.from({ length: size }, () => this.mean.map((m, i) => m + this.spread[i] * gaussian(this.random)));
    candidates.push([...this.weights]);
    return candidates;
  }
  finishGeneration(ranked, countAttempts = true) {
    ranked.sort((a, b) => b.score - a.score);
    const elite = ranked.slice(0, this.config.poles === 2 ? 8 : 6);
    for (let i = 0; i < this.config.dimension; i++) {
      const mean = elite.reduce((sum, e) => sum + e.weights[i], 0) / elite.length;
      const variance = elite.reduce((sum, e) => sum + (e.weights[i] - mean) ** 2, 0) / elite.length;
      this.mean[i] = mean; this.spread[i] = Math.max(.08, Math.sqrt(variance));
    }
    this.generations++; if (countAttempts) this.episodes += ranked.length * 3;
    const evaluation = this.considerModel(ranked[0].weights);
    this.record(evaluation);
    return this.score;
  }
  considerModel(weights) {
    const evaluation = evaluatePolicy(weights, this.config);
    if (evaluation.mean > this.score || (evaluation.mean === this.score && evaluation.success >= this.success)) {
      this.weights = [...weights]; this.score = evaluation.mean; this.success = evaluation.success;
      this.modelGeneration = this.generations; this.modelAttempts = this.episodes;
    }
    return evaluation;
  }
  record(evaluation) {
    const point = { generation: this.generations, attempts: this.episodes, evaluation: evaluation.mean, best: this.score, success: this.success };
    if (this.history.at(-1)?.attempts === this.episodes) this.history[this.history.length - 1] = point;
    else this.history.push(point);
    if (this.history.length > 120) this.history.shift();
  }
  checkpoint() {
    const pending = this.pending;
    if (!pending) return;
    const ranked = [...pending.ranked];
    if (pending.trialIndex > 0) ranked.push({ weights: pending.candidates[pending.candidateIndex], score: pending.partialScore / pending.trialIndex });
    if (!ranked.length) return;
    const winner = ranked.reduce((a, b) => a.score >= b.score ? a : b);
    this.record(this.considerModel(winner.weights));
  }
  async trainAttemptsAsync(count, yieldControl, isActive = () => true, onProgress = () => {}) {
    if (!Number.isInteger(count) || count < 1) throw new RangeError('Attempt count must be a positive integer');
    let completed = 0;
    while (completed < count) {
      if (!isActive()) return { completed, cancelled: true };
      if (!this.pending) {
        const starts = Array.from({ length: 3 }, () => initialState(this.random, this.config));
        this.pending = { starts, candidates: this.candidates(), candidateIndex: 0, trialIndex: 0, partialScore: 0, ranked: [] };
      }
      const p = this.pending;
      p.partialScore += rollout(p.candidates[p.candidateIndex], p.starts[p.trialIndex], this.config);
      p.trialIndex++; this.episodes++; completed++;
      if (p.trialIndex === 3) {
        p.ranked.push({ weights: p.candidates[p.candidateIndex], score: p.partialScore / 3 });
        p.candidateIndex++; p.trialIndex = 0; p.partialScore = 0;
        if (p.candidateIndex === p.candidates.length) { this.finishGeneration(p.ranked, false); this.pending = null; }
      }
      if (completed % 3 === 0 || completed === count) { onProgress(completed); await yieldControl(); }
    }
    if (!isActive()) return { completed, cancelled: true };
    this.checkpoint();
    return { completed, cancelled: false };
  }
  trainGeneration() {
    const starts = Array.from({ length: 3 }, () => initialState(this.random, this.config));
    const ranked = this.candidates().map(weights => ({ weights, score: starts.reduce((sum, s) => sum + rollout(weights, s, this.config), 0) / starts.length }));
    return this.finishGeneration(ranked);
  }
  async trainGenerationAsync(yieldControl, isActive = () => true) {
    const starts = Array.from({ length: 3 }, () => initialState(this.random, this.config)), ranked = [];
    for (const weights of this.candidates()) {
      if (!isActive()) return null;
      ranked.push({ weights, score: starts.reduce((sum, s) => sum + rollout(weights, s, this.config), 0) / starts.length });
      if (ranked.length % 3 === 0) await yieldControl();
    }
    if (!isActive()) return null;
    return this.finishGeneration(ranked);
  }
}
