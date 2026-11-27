import {World, Vec2, Box, PrismaticJoint, RevoluteJoint} from './vendor/planck.mjs';

export const DT = .02, PHYSICS_DT = .005, X_LIMIT = 5;
export const GRAVITY = 9.81, CART_MASS = 2, MAX_FORCE = 25, MOTOR_TIME = .03;
export const PHYSICS_VERSION = 'experiment-2kg-300g-25N';
export const LENGTHS = Array(5).fill(.65);
export const MASSES = Array(5).fill(.30);
export const HOLD_SECONDS = 20, EVAL_SECONDS = 40, EVAL_TRIALS = 8, PASS_COUNT = 7;
const ANGLE_LIMIT = Math.PI / 18, WIDTH = .022;
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const inputSize = level => 3 + 3 * level;
export const REWARD_PROTOCOL = 'recovery-2';
export function postureReward({angle, speed, stability, mean, all, x, action, acquired, impacted, progress, recovered}) {
  const nearUpright = Math.exp(-((angle / .65) ** 2));
  const rotation = (acquired ? .04 : .01) * (1 - nearUpright) * Math.min(2, (speed / 8) ** 2)
    + .1 * nearUpright * Math.min(2, (speed / 3) ** 2);
  const center = .025 * (x / 2.4) ** 2;
  const edge = .8 * (Math.max(0, Math.abs(x) - 3.5) / 1.5) ** 2;
  return {
    posture: .25 * mean + .15 * all ** 3 + 1.6 * stability,
    recovery: impacted ? .55 * stability + 4 * progress + recovered : 0,
    rotation: -rotation, position: -center - edge, control: -.001 * action ** 2
  };
}

export class CartPole {
  constructor(level, random, {gravity = GRAVITY, damping = .005, cartDamping = .025, substeps = DT / PHYSICS_DT, mixedStarts = false} = {}) {
    this.level = level;
    this.random = random;
    this.mixedStarts = mixedStarts;
    this.world = new World(Vec2(0, -gravity));
    this.world.setAllowSleeping(false);
    this.substeps = substeps;
    const rail = this.world.createBody();
    this.cart = this.world.createDynamicBody({linearDamping: cartDamping});
    this.cart.createFixture(Box(.18, .075), {density: CART_MASS / (.36 * .15), filterMaskBits: 0});
    this.world.createJoint(PrismaticJoint({}, rail, this.cart, Vec2(0, 0), Vec2(1, 0)));
    this.links = [];
    this.joints = [];
    let parent = this.cart;
    for (let i = 0; i < level; i++) {
      const length = LENGTHS[i];
      const rod = this.world.createDynamicBody();
      // Parallel planes in projection: no artificial cart/link or link/link collisions.
      rod.createFixture(Box(WIDTH / 2, length / 2), {density: MASSES[i] / (WIDTH * length), filterMaskBits: 0});
      this.joints.push(this.world.createJoint(RevoluteJoint({
        localAnchorA: Vec2(0, i ? LENGTHS[i - 1] / 2 : 0),
        localAnchorB: Vec2(0, -length / 2), referenceAngle: 0,
        enableMotor: false
      }, parent, rod)));
      this.links.push(rod);
      parent = rod;
    }
    this.damping = damping;
    this.world.setWarmStarting(false);
    this.reset();
  }

  reset() {
    this.cart.setTransform(Vec2(0, 0), 0);
    this.cart.setAngularVelocity(0);
    this.cart.setLinearVelocity(Vec2(0, 0));
    let x = 0, y = 0;
    const choice = this.mixedStarts ? this.random() : 0;
    this.startKind = !this.mixedStarts || choice < .34 ? 'down' : choice < .67 ? 'tilted' : 'upright';
    const base = this.startKind === 'down' ? Math.PI
      : this.startKind === 'tilted' ? (this.random() < .5 ? -1 : 1) * (.35 + this.random() * 1.2) : 0;
    this.links.forEach((body, i) => {
      const angle = base + (this.random() - .5) * .12, l = LENGTHS[i];
      const dx = -l * Math.sin(angle), dy = l * Math.cos(angle);
      body.setTransform(Vec2(x + dx / 2, y + dy / 2), angle);
      body.setLinearVelocity(Vec2(0, 0));
      body.setAngularVelocity(0);
      x += dx;
      y += dy;
    });
    this.steps = this.hold = this.bestHold = this.totalReward = this.maxTravel = 0;
    this.firstUpright = null;
    this.force = 0;
    this.commandForce = 0;
    this.lastImpact = null;
    this.nextImpact = null;
    this.acquired = false;
    this.stableSteps = 0;
    this.impactWindowEnd = 0;
    this.impactWorstAngle = 0;
    this.impactHold = 0;
    this.impactTrials = [];
    this.previousStability = 0;
  }

  prepareImpact(load) {
    const direction = this.random() < .5 ? -1 : 1;
    const localX = -direction * .18;
    const point = this.cart.getWorldPoint(Vec2(localX, 0));
    return {body: 0, localX, localY: 0, load: clamp(load, 0, 100), direction, point: [point.x, point.y]};
  }

  applyImpact(hit) {
    const body = this.cart;
    const point = body.getWorldPoint(Vec2(-hit.direction * .18, 0));
    body.applyLinearImpulse(Vec2(hit.direction * hit.load * .1, 0), point, true);
    this.lastImpact = {...hit, point: [point.x, point.y], time: this.steps * DT};
    this.impactWindowEnd = this.steps * DT + 3;
    this.impactWorstAngle = 0;
    this.impactHold = 0;
    const angle = Math.max(...this.links.map(b => Math.abs(Math.atan2(Math.sin(b.getAngle()), Math.cos(b.getAngle())))));
    this.impactTrials.push({time: this.lastImpact.time, direction: hit.direction, load: hit.load,
      eligible: this.acquired && angle <= Math.PI / 6, maxAngle: angle, rotations: 0,
      startAngles: this.links.map(b => b.getAngle()), recoveryTime: null, stable: 0});
    return this.lastImpact;
  }

  impact(load) {
    return this.applyImpact(this.prepareImpact(load));
  }

  randomImpact(config) {
    const minimum = config.impactMin ?? config.impactLoad ?? 2;
    const maximum = config.impactMax ?? config.impactLoad ?? 2;
    const load = minimum + this.random() * (maximum - minimum);
    return {...this.impact(load), load};
  }

  disturb(config) {
    if (!config.impactEnabled) { this.nextImpact = null; return; }
    if (this.nextImpact === null) this.nextImpact = this.steps * DT + config.impactInterval;
    if (this.steps * DT + 1e-8 < this.nextImpact) return;
    this.randomImpact(config);
    this.nextImpact = this.steps * DT + config.impactInterval;
  }

  observe() {
    return [this.cart.getPosition().x / X_LIMIT, clamp(this.cart.getLinearVelocity().x / 5, -4, 4),
      ...this.links.flatMap(b => [Math.sin(b.getAngle()), Math.cos(b.getAngle()), clamp(b.getAngularVelocity() / 10, -4, 4)]),
      this.force / MAX_FORCE];
  }

  step(action, seconds) {
    this.commandForce = MAX_FORCE * clamp(action, -1, 1);
    for (let j = 0; j < this.substeps; j++) {
      this.force += (this.commandForce - this.force) * (1 - Math.exp(-DT / this.substeps / MOTOR_TIME));
      this.cart.applyForceToCenter(Vec2(this.force, 0), true);
      if (this.damping) for (const joint of this.joints) {
        const torque = this.damping * joint.getJointSpeed();
        joint.getBodyA().applyTorque(torque, true);
        joint.getBodyB().applyTorque(-torque, true);
      }
      this.world.step(DT / this.substeps, 12, 8);
    }
    this.steps++;
    const x = this.cart.getPosition().x, obs = this.observe();
    const finite = obs.every(Number.isFinite) && this.links.every(b => Number.isFinite(b.getAngularVelocity()));
    const terminated = !finite || Math.abs(x) > X_LIMIT;
    const truncated = !terminated && this.steps >= Math.round(seconds / DT);
    const heights = this.links.map(b => (1 + Math.cos(b.getAngle())) / 2);
    const mean = heights.reduce((sum, h) => sum + h, 0) / this.level;
    const all = Math.min(...heights);
    const safe = !terminated && all >= (1 + Math.cos(ANGLE_LIMIT)) / 2;
    const errors = this.links.map(b => Math.abs(Math.atan2(Math.sin(b.getAngle()), Math.cos(b.getAngle()))));
    const worstAngle = Math.max(...errors);
    const worstSpeed = Math.max(...this.links.map(b => Math.abs(b.getAngularVelocity())));
    this.stableSteps = safe && worstSpeed < 1 ? this.stableSteps + 1 : 0;
    if (this.stableSteps >= 10) this.acquired = true;
    if (safe && this.firstUpright === null) this.firstUpright = this.steps * DT;
    this.hold = safe ? this.hold + 1 : 0;
    this.bestHold = Math.max(this.bestHold, this.hold);
    this.maxTravel = Math.max(this.maxTravel, Number.isFinite(x) ? Math.abs(x) : 0);
    const stability = Math.min(...this.links.map(b => {
      const angle = Math.atan2(Math.sin(b.getAngle()), Math.cos(b.getAngle()));
      return 1 / (1 + (angle / .23) ** 2 + (b.getAngularVelocity() / 2.5) ** 2);
    }));
    const impactActive = this.lastImpact && this.steps * DT <= this.impactWindowEnd;
    let recovered = 0;
    const trial = this.impactTrials.at(-1);
    if (impactActive) {
      this.impactWorstAngle = Math.max(this.impactWorstAngle, worstAngle);
      this.impactHold = safe ? this.impactHold + DT : 0;
      trial.maxAngle = Math.max(trial.maxAngle, worstAngle);
      trial.rotations = Math.max(trial.rotations, ...this.links.map((b, i) =>
        Math.floor(Math.abs(b.getAngle() - trial.startAngles[i]) / (2 * Math.PI))));
      trial.stable = safe && worstSpeed < 1 ? trial.stable + DT : 0;
      if (trial.recoveryTime === null && trial.stable >= .5) {
        trial.recoveryTime = this.steps * DT - trial.time;
        recovered = .8 / (1 + trial.recoveryTime);
      }
    }
    const parts = postureReward({angle: worstAngle, speed: worstSpeed, stability, mean, all, x, action,
      acquired: this.acquired, impacted: Boolean(impactActive),
      progress: stability - this.previousStability, recovered});
    const reward = terminated ? -8 : Object.values(parts).reduce((sum, value) => sum + value, 0);
    this.previousStability = stability;
    this.rewardParts = parts;
    this.totalReward += reward;
    return {obs, reward, terminated, truncated, invalid: !finite};
  }

  result() {
    return {reward: this.totalReward, hold: this.bestHold * DT, first: this.firstUpright,
      startKind: this.startKind, impactAngle: this.lastImpact ? this.impactWorstAngle : null,
      impactHold: this.impactHold,
      impacts: this.impactTrials.map(({startAngles, stable, ...trial}) => ({...trial,
        resisted: trial.eligible && trial.maxAngle <= Math.PI / 6 && trial.rotations === 0 && trial.recoveryTime !== null})),
      travel: this.maxTravel, success: this.bestHold >= Math.round(HOLD_SECONDS / DT)};
  }

  frame() {
    const x = this.cart.getPosition().x;
    const points = [[x, 0], ...this.links.map((b, i) => {
      const p = b.getWorldPoint(Vec2(0, LENGTHS[i] / 2));
      return [p.x, p.y];
    })];
    return {points, force: this.force, impact: this.lastImpact, time: this.steps * DT, ...this.result(), streak: this.hold * DT};
  }
}
