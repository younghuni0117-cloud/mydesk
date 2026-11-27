import {World, Vec2, Box, PrismaticJoint, RevoluteJoint} from './vendor/planck.mjs';

export const DT = .02, PHYSICS_DT = .005, X_LIMIT = 5;
export const GRAVITY = 9.81, CART_MASS = 1, MAX_FORCE = 10;
export const LENGTHS = Array(5).fill(.65);
export const MASSES = [.12, .09, .07, .05, .04];
export const HOLD_SECONDS = 20, EVAL_SECONDS = 40, EVAL_TRIALS = 8, PASS_COUNT = 7;
const ANGLE_LIMIT = Math.PI / 18, WIDTH = .022;
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const inputSize = level => 2 + 3 * level;

export class CartPole {
  constructor(level, random, {gravity = GRAVITY, damping = .001, cartDamping = .025, substeps = DT / PHYSICS_DT} = {}) {
    this.level = level;
    this.random = random;
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
    this.links.forEach((body, i) => {
      const angle = Math.PI + (this.random() - .5) * .12, l = LENGTHS[i];
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
    this.lastImpact = null;
    this.nextImpact = null;
  }

  impact(load, randomPosition = true) {
    const bodyIndex = randomPosition ? Math.floor(this.random() * (this.level + 1)) : 0;
    const body = bodyIndex ? this.links[bodyIndex - 1] : this.cart;
    const localY = bodyIndex ? (this.random() - .5) * LENGTHS[bodyIndex - 1] : 0;
    const point = body.getWorldPoint(Vec2(0, localY));
    const direction = this.random() < .5 ? -1 : 1;
    // A 0.1-second force pulse is represented by its impulse, in N·s.
    body.applyLinearImpulse(Vec2(direction * clamp(load, 0, 100) * .1, 0), point, true);
    this.lastImpact = {body: bodyIndex, point: [point.x, point.y], direction, time: this.steps * DT};
    return this.lastImpact;
  }

  randomImpact(config) {
    const minimum = config.impactMin ?? config.impactLoad ?? 2;
    const maximum = config.impactMax ?? config.impactLoad ?? 2;
    const load = minimum + this.random() * (maximum - minimum);
    return {...this.impact(load, true), load};
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
      ...this.links.flatMap(b => [Math.sin(b.getAngle()), Math.cos(b.getAngle()), clamp(b.getAngularVelocity() / 10, -4, 4)])];
  }

  step(action, seconds) {
    this.force = MAX_FORCE * clamp(action, -1, 1);
    for (let j = 0; j < this.substeps; j++) {
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
    if (safe && this.firstUpright === null) this.firstUpright = this.steps * DT;
    this.hold = safe ? this.hold + 1 : 0;
    this.bestHold = Math.max(this.bestHold, this.hold);
    this.maxTravel = Math.max(this.maxTravel, Number.isFinite(x) ? Math.abs(x) : 0);
    const stability = Math.min(...this.links.map(b => {
      const angle = Math.atan2(Math.sin(b.getAngle()), Math.cos(b.getAngle()));
      return 1 / (1 + (angle / .23) ** 2 + (b.getAngularVelocity() / 2.5) ** 2);
    }));
    const reward = terminated ? -5 : .32 * mean + .12 * all ** 3 + 1.2 * stability
      + (safe ? .12 * Math.min(1, this.hold * DT) : 0)
      - .05 * (x / X_LIMIT) ** 2 - .008 * action ** 2;
    this.totalReward += reward;
    return {obs, reward, terminated, truncated, invalid: !finite};
  }

  result() {
    return {reward: this.totalReward, hold: this.bestHold * DT, first: this.firstUpright,
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
