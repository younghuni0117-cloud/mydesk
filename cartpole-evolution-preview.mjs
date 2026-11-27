import {CartPole, DT, LENGTHS, X_LIMIT} from './cartpole-evolution-core.mjs?v=balance1';
import {CartPPO} from './cartpole-evolution-ppo.mjs?v=balance1';

export function railProjection(width, height, level, cart) {
  const reach = LENGTHS.slice(0, level).reduce((sum, length) => sum + length, 0);
  const scale = 105 / LENGTHS[0];
  const inset = Math.min(117, width * .39);
  const halfRail = width / 2 - inset;
  const railX = x => width / 2 + x * halfRail / X_LIMIT;
  // Fixed-size model coordinates are relative to the moving pivot.
  return {
    reach, halfRail, railX,
    modelX: x => railX(cart) + (x - cart) * scale,
    modelY: y => height / 2 - y * scale
  };
}

export function interpolateFrame(from, to, fraction) {
  if (!to) return from;
  return {...from, time: from.time + (to.time - from.time) * fraction,
    points: from.points.map(([x, y], i) => [
      x + (to.points[i][0] - x) * fraction,
      y + (to.points[i][1] - y) * fraction
    ])};
}

// The viewer runs a separate physics world. It freezes a copy of the actor for
// one displayed episode, regardless of how many PPO updates finish meanwhile.
export class PreviewEpisode {
  constructor(level, seconds, snapshot, stochastic, seed = (Math.random() * 2 ** 32) >>> 0) {
    this.seconds = seconds;
    this.policy = new CartPPO(level, seed);
    this.policy.actor.w = snapshot.actor.slice();
    this.policy.logStd = snapshot.logStd.slice();
    this.updates = snapshot.updates;
    this.stochastic = stochastic;
    this.env = new CartPole(level, () => this.policy.random.uniform(), {mixedStarts: stochastic});
    this.current = this.env.frame();
    this.debt = 0;
    this.done = false;
    this.advance();
  }

  advance() {
    if (this.pendingHit && !this.pendingHit.applied && this.env.steps * DT >= this.pendingHit.contact) {
      this.env.applyImpact(this.pendingHit);
      this.pendingHit.applied = true;
    }
    if (this.pendingHit && this.env.steps * DT > this.pendingHit.end) this.pendingHit = null;
    if (this.disturbance?.impactEnabled && !this.pendingHit && this.env.steps * DT >= this.nextHit) {
      this.impact(this.disturbance);
    }
    const obs = this.env.observe();
    const action = this.stochastic ? this.policy.action(obs).action : this.policy.predict(obs);
    const {invalid, terminated, truncated} = this.env.step(action, this.seconds);
    this.next = invalid ? this.current : this.env.frame();
    this.terminal = terminated || truncated;
  }

  impact(config) {
    if (this.pendingHit) return;
    const load = config.impactMin + this.policy.random.uniform() * (config.impactMax - config.impactMin);
    const strength = config.impactMax > config.impactMin ? (load - config.impactMin) / (config.impactMax - config.impactMin) : .5;
    const duration = .46 - .34 * strength;
    const start = this.env.steps * DT;
    this.pendingHit = {...this.env.prepareImpact(load), start, duration,
      contact: start + duration, end: start + duration + .22, applied: false};
    this.nextHit = start + config.impactInterval;
  }

  setDisturbance(config) {
    this.disturbance = config;
    if (!Number.isFinite(this.nextHit)) this.nextHit = this.env.steps * DT + config.impactInterval;
  }

  frame(elapsed) {
    this.debt += Math.min(.1, Math.max(0, elapsed));
    while (!this.done && this.debt >= DT) {
      this.debt -= DT;
      this.current = this.next;
      if (this.terminal) this.done = true;
      else this.advance();
    }
    const result = this.done ? this.current : interpolateFrame(this.current, this.next, this.debt / DT);
    return {...result, hammer: this.pendingHit};
  }
}
