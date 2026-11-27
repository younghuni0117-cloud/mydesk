import {PPO, Adam, Random} from './evolution-ppo.mjs?v=biped7';
import {inputSize} from './cartpole-evolution-core.mjs?v=rail10';

class DenseNetwork {
  constructor(input, random, outputScale) {
    this.input = input;
    this.size = 32;
    this.stride = input + 1;
    this.output = this.size * this.stride;
    const scale = Math.sqrt(6 / (input + this.size));
    this.w = Array.from({length: this.output + this.size + 1}, (_, i) => {
      if (i === this.output + this.size || (i < this.output && i % this.stride === input)) return 0;
      return (random.uniform() * 2 - 1) * (i < this.output ? scale : outputScale);
    });
  }

  forward(x) {
    const h = Array(this.size);
    let value = this.w.at(-1);
    for (let i = 0; i < this.size; i++) {
      const start = i * this.stride;
      let z = this.w[start + this.input];
      for (let j = 0; j < this.input; j++) z += this.w[start + j] * x[j];
      h[i] = Math.tanh(z);
      value += h[i] * this.w[this.output + i];
    }
    return {x, h, value};
  }

  gradient({x, h}, dy, g) {
    for (let i = 0; i < this.size; i++) {
      g[this.output + i] += dy * h[i];
      const dh = dy * this.w[this.output + i] * (1 - h[i] ** 2), start = i * this.stride;
      for (let j = 0; j < this.input; j++) g[start + j] += dh * x[j];
      g[start + this.input] += dh;
    }
    g[g.length - 1] += dy;
  }
}

export class CartPPO extends PPO {
  constructor(level, seed) {
    super(seed);
    this.random = new Random(seed);
    this.actor = new DenseNetwork(inputSize(level), this.random, .01);
    this.critic = new DenseNetwork(inputSize(level), this.random, .15);
    this.actorAdam = new Adam(this.actor.w.length);
    this.criticAdam = new Adam(this.critic.w.length);
    this.logStd = [Math.log(1.1)];
    this.settings = {...this.settings, lr: .00065, valueLR: .0015, gamma: .995,
      entropy: .008, epochs: 6, minibatch: 128};
  }

  *update(rows) {
    const result = yield* super.update(rows);
    // Preserve broad exploration early, then gradually allow precise control.
    const progress = Math.min(1, this.updates / 300);
    const minimumStd = .4 * (1 - progress) + .12 * progress;
    this.logStd[0] = Math.max(this.logStd[0], Math.log(minimumStd));
    return result;
  }

  checkpoint() {
    const {normalization, ...snapshot} = super.snapshot();
    return snapshot;
  }

  load(snapshot) {
    if (!Number.isSafeInteger(snapshot?.updates) || snapshot.updates < 0
        || snapshot.logStd?.length !== 1 || snapshot.logStd[0] < -2.5 || snapshot.logStd[0] > .5) {
      throw new Error('PPO 체크포인트 형식 오류');
    }
    const settings = this.settings;
    super.restore(snapshot);
    this.settings = settings;
  }

  predict(obs) {
    return Math.tanh(this.actor.forward(obs).value);
  }
}
