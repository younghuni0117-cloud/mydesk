import { INPUTS } from './physics.mjs';

export const CONFIG = Object.freeze({ layers: [INPUTS, 64, 64, 2], gamma: 0.98,
  rate: 0.0007, batch: 32, warmup: 192, capacity: 16000, targetEvery: 160,
  trainEvery: 4, epsilonStart: 1, epsilonEnd: 0.04, decay: 22000, clip: 5 });

export function randomSource(seed) {
  let value = seed >>> 0 || 1;
  return {
    get state() { return value >>> 0; },
    next() {
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      return (value >>> 0) / 4294967296;
    }
  };
}

const layers = CONFIG.layers.slice(1).map((size, i) => ({ size, inputs: CONFIG.layers[i] }));
let parameterCount = 0;
for (const layer of layers) {
  layer.start = parameterCount;
  parameterCount += layer.size * (layer.inputs + 1);
}

export function validWeights(weights) {
  return weights?.length === parameterCount && Array.from(weights).every(Number.isFinite);
}

export function forward(weights, observation) {
  const values = [observation];
  for (const { size, inputs, start } of layers) {
    const previous = values.at(-1);
    const output = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const offset = start + i * (inputs + 1);
      let sum = weights[offset + inputs];
      for (let j = 0; j < inputs; j++) sum += weights[offset + j] * previous[j];
      output[i] = values.length === layers.length ? sum : Math.max(0, sum);
    }
    values.push(output);
  }
  return values;
}

export const greedy = q => +(q[1] > q[0]);

export class DQN {
  constructor(seed, saved) {
    if (saved && (![saved.weights, saved.target, saved.first, saved.second].every(validWeights)
      || ![saved.updates, saved.decisions, saved.cursor, saved.rng].every(x => Number.isInteger(x) && x >= 0)
      || !Array.isArray(saved.replay) || saved.replay.length > CONFIG.capacity || saved.cursor >= CONFIG.capacity
      || saved.replay.some(t => ![t.s,t.next].every(s => s?.length === INPUTS && s.every(Number.isFinite))
        || ![0,1].includes(t.a) || !Number.isFinite(t.r) || typeof t.done !== 'boolean'))) {
      throw Error('저장된 신경망 또는 경험 데이터가 손상되었습니다.');
    }
    this.rng = randomSource(saved?.rng ?? seed);
    this.weights = saved ? new Float32Array(saved.weights) : new Float32Array(parameterCount);
    if (!saved) {
      for (const { size, inputs, start } of layers) {
        const range = Math.sqrt(6 / (size + inputs));
        for (let i = 0; i < size; i++) {
          for (let j = 0; j < inputs; j++) {
            this.weights[start + i * (inputs + 1) + j] = (2 * this.rng.next() - 1) * range;
          }
        }
      }
    }
    this.target = new Float32Array(saved?.target ?? this.weights);
    this.first = new Float32Array(saved?.first ?? parameterCount);
    this.second = new Float32Array(saved?.second ?? parameterCount);
    this.replay = saved?.replay ?? [];
    this.cursor = saved?.cursor ?? 0;
    this.updates = saved?.updates ?? 0;
    this.decisions = saved?.decisions ?? 0;
    this.explorationUntil = saved?.explorationUntil ?? 0;
    this.loss = saved?.loss ?? null;
  }

  get epsilon() {
    const normal = CONFIG.epsilonEnd + (CONFIG.epsilonStart - CONFIG.epsilonEnd)
      * Math.exp(-this.decisions / CONFIG.decay);
    return this.decisions < this.explorationUntil ? Math.max(0.5, normal) : normal;
  }

  select(observation) {
    const q = forward(this.weights, observation).at(-1);
    if (!q.every(Number.isFinite) || q.some(value => Math.abs(value) > 1e4)) throw Error('비정상 Q-value');
    if (this.rng.next() >= this.epsilon) return greedy(q);
    return +(this.rng.next() < 0.5);
  }

  remember(transition) {
    this.replay[this.cursor] = transition;
    this.cursor = (this.cursor + 1) % CONFIG.capacity;
    this.decisions++;
  }

  optimize() {
    if (this.replay.length < CONFIG.warmup || this.decisions % CONFIG.trainEvery) return;
    const gradient = new Float32Array(parameterCount);
    let loss = 0;
    for (let n = 0; n < CONFIG.batch; n++) {
      const { s, a, r, next, done } = this.replay[Math.floor(this.rng.next() * this.replay.length)];
      const values = forward(this.weights, s);
      const target = done ? r : r + CONFIG.gamma * forward(this.target, next).at(-1)[greedy(forward(this.weights, next).at(-1))];
      const error = values.at(-1)[a] - target;
      loss += Math.abs(error) < 1 ? error ** 2 / 2 : Math.abs(error) - 0.5;
      let delta = new Float32Array(2);
      delta[a] = Math.max(-1, Math.min(1, error)) / CONFIG.batch;
      for (let k = layers.length - 1; k >= 0; k--) {
        const { inputs, size, start } = layers[k];
        const previous = values[k];
        const previousDelta = new Float32Array(inputs);
        for (let i = 0; i < size; i++) {
          if (delta[i] === 0) continue;
          const offset = start + i * (inputs + 1);
          gradient[offset + inputs] += delta[i];
          for (let j = 0; j < inputs; j++) {
            gradient[offset + j] += delta[i] * previous[j];
            if (previous[j] > 0) previousDelta[j] += this.weights[offset + j] * delta[i];
          }
        }
        delta = previousDelta;
      }
    }
    this.loss = loss / CONFIG.batch;
    const norm = Math.sqrt(gradient.reduce((total, value) => total + value ** 2, 0));
    if (!Number.isFinite(this.loss) || !Number.isFinite(norm)) throw Error('학습 손실이 유한하지 않습니다.');
    const scale = Math.min(1, CONFIG.clip / (norm || 1));
    const count = ++this.updates;
    const correction1 = 1 - 0.9 ** count;
    const correction2 = 1 - 0.999 ** count;
    for (let i = 0; i < parameterCount; i++) {
      const g = gradient[i] * scale;
      this.first[i] = 0.9 * this.first[i] + 0.1 * g;
      this.second[i] = 0.999 * this.second[i] + 0.001 * g * g;
      this.weights[i] -= CONFIG.rate * (this.first[i] / correction1) / (Math.sqrt(this.second[i] / correction2) + 1e-8);
    }
    if (count % CONFIG.targetEvery === 0) this.target.set(this.weights);
  }

  snapshot() {
    return { weights: this.weights, target: this.target, first: this.first, second: this.second,
      replay: this.replay, cursor: this.cursor, updates: this.updates, decisions: this.decisions,
      rng: this.rng.state, explorationUntil: this.explorationUntil, loss: this.loss, config: CONFIG };
  }
}
