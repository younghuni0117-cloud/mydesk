// CartPole dynamics with a linear policy trained by cross-entropy policy search.
export const DT = 0.02;
export const MAX_STEPS = 1000;
export const X_LIMIT = 2.4;
export const ANGLE_LIMIT = 12 * Math.PI / 180;
export function initialState(random = Math.random) {
  return Array.from({ length: 4 }, () => (random() - 0.5) * 0.08);
}
export function advance(state, action) {
  const [x, velocity, angle, angularVelocity] = state;
  const force = Math.max(-1, Math.min(1, action)) * 10;
  const sin = Math.sin(angle), cos = Math.cos(angle);
  const temp = (force + 0.05 * angularVelocity ** 2 * sin) / 1.1;
  const angularAcceleration = (9.8 * sin - cos * temp) / (0.5 * (4 / 3 - 0.1 * cos ** 2 / 1.1));
  const acceleration = temp - 0.05 * angularAcceleration * cos / 1.1;
  return [x + DT * velocity, velocity + DT * acceleration,
    angle + DT * angularVelocity, angularVelocity + DT * angularAcceleration];
}
export function failed(state) {
  return state.some(v => !Number.isFinite(v)) || Math.abs(state[0]) > X_LIMIT || Math.abs(state[2]) > ANGLE_LIMIT;
}
export function actionFor(weights, state) {
  const scale = [0.5, 0.6, 6, 1.5];
  return weights.reduce((sum, w, i) => sum + w * state[i] * scale[i], 0) >= 0 ? 1 : -1;
}
export function rollout(weights, start) {
  let state = [...start], steps = 0;
  while (steps < MAX_STEPS) {
    state = advance(state, actionFor(weights, state));
    if (failed(state)) break;
    steps++;
  }
  return steps;
}
function gaussian(random) {
  return Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random());
}
export class PolicySearch {
  constructor(random = Math.random) {
    this.random = random;
    this.mean = [0, 0, 0, 0];
    this.spread = [1, 1, 1, 1];
    this.weights = [0, 0, 0, 0];
    this.generations = 0;
    this.episodes = 0;
    this.score = 0;
    this.history = [];
  }
  trainGeneration() {
    // Every policy sees the same starts within a generation for a fair comparison.
    const starts = Array.from({ length: 3 }, () => initialState(this.random));
    const candidates = Array.from({ length: 24 }, () => this.mean.map((m, i) => m + this.spread[i] * gaussian(this.random)));
    candidates.push([...this.weights]);
    const ranked = candidates.map(weights => ({ weights,
      score: starts.reduce((sum, start) => sum + rollout(weights, start), 0) / starts.length,
    })).sort((a, b) => b.score - a.score);
    const elite = ranked.slice(0, 6);
    this.weights = [...ranked[0].weights];
    this.score = ranked[0].score;
    for (let i = 0; i < 4; i++) {
      const mean = elite.reduce((sum, e) => sum + e.weights[i], 0) / elite.length;
      const variance = elite.reduce((sum, e) => sum + (e.weights[i] - mean) ** 2, 0) / elite.length;
      this.mean[i] = mean;
      this.spread[i] = Math.max(0.08, Math.sqrt(variance));
    }
    this.generations++;
    this.episodes += candidates.length * starts.length;
    this.history.push(this.score);
    if (this.history.length > 60) this.history.shift();
    return this.score;
  }
}
