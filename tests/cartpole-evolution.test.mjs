import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {CartPole, DT, EVAL_SECONDS, GRAVITY, HOLD_SECONDS, LENGTHS, MASSES, MAX_FORCE, CART_MASS, MOTOR_TIME, PHYSICS_VERSION, inputSize, postureReward, ServoDrive, CONTINUOUS_FORCE} from '../cartpole-evolution-core.mjs';
import {Trainer, evaluate, options} from '../cartpole-evolution-training.mjs';
import {PreviewEpisode, railProjection} from '../cartpole-evolution-preview.mjs';
import {DEFAULT_MENUS, validateMenus, withCartPoleEvolution} from '../navigation-data.mjs';

function energy(env) {
  return [env.cart, ...env.links].reduce((sum, b) => {
    const v = b.getLinearVelocity(), w = b.getAngularVelocity(), mass = b.getMass();
    return sum + .5 * mass * (v.x ** 2 + v.y ** 2) + .5 * b.getInertia() * w ** 2
      + mass * GRAVITY * b.getPosition().y;
  }, 0);
}

test('1–5 passive links hang, with stable rail constraints, anchors and convergent energy', () => {
  for (let level = 1; level <= 5; level++) {
    const errors = [1, 4].map(substeps => {
      const env = new CartPole(level, () => .99, {substeps, damping: 0, cartDamping: 0});
      assert.equal(env.observe().length, inputSize(level));
      assert.equal(env.frame().points.length, level + 1);
      assert.ok(Math.abs(env.cart.getMass() - 2) < 1e-9);
      assert.equal(CART_MASS, 2);
      let prevY = 0;
      env.links.forEach((b, i) => {
        assert.ok(b.getPosition().y < prevY);
        assert.ok(Math.abs(b.getMass() - MASSES[i]) < 1e-9);
        assert.ok(Math.abs(b.getInertia() - MASSES[i] * (LENGTHS[i] ** 2 + .022 ** 2) / 12) < 1e-9);
        assert.equal(env.joints[i].isMotorEnabled(), false);
        assert.equal(LENGTHS[i], .65);
        prevY = b.getPosition().y;
      });
      const initial = energy(env);
      let error = 0;
      for (let k = 0; k < 500; k++) {
        assert.equal(env.step(0, 20).terminated, false);
        error = Math.max(error, Math.abs(energy(env) - initial));
      }
      assert.ok(Math.abs(env.cart.getPosition().y) < 1e-7);
      assert.ok(Math.abs(env.cart.getAngle()) < 1e-7);
      if (substeps === 4) for (const joint of env.joints) {
        const a = joint.getAnchorA(), b = joint.getAnchorB();
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < .001);
      }
      return error / Math.max(1, Math.abs(initial));
    });
    assert.ok(errors[1] < errors[0] && errors[1] < .002);
  }
});

test('force moves cart and reacts through passive pole; timeout bootstraps and boundary terminates', () => {
  const env = new CartPole(1, () => .5);
  env.step(2, 20);
  assert.ok(Math.abs(env.force - MAX_FORCE * (1 - Math.exp(-DT / MOTOR_TIME))) < 1e-10);
  assert.equal(env.observe().at(-2), env.force / MAX_FORCE);
  assert.ok(env.cart.getPosition().x > 0 && env.cart.getLinearVelocity().x > 0);
  assert.ok(Math.abs(env.links[0].getAngularVelocity()) > .01);
  while (!env.step(1, 20).terminated) {}
  assert.ok(env.maxTravel > 2.4);
  env.reset();
  for (let i = 0; i < 249; i++) assert.equal(env.step(0, 5).truncated, false);
  assert.deepEqual([env.step(0, 5).truncated, env.result().success], [true, false]);
});

test('servo reaches 95 percent at 0.06 seconds and old physical checkpoints cannot reuse mismatched weights', () => {
  const env = new CartPole(1, () => .5);
  const drive = new ServoDrive();
  for (let i = 0; i < 12; i++) drive.step(80, 0, .005);
  assert.equal(MAX_FORCE, 80);
  assert.equal(MOTOR_TIME, .02);
  assert.ok(drive.force >= .95 * MAX_FORCE && drive.force < MAX_FORCE);
  const previous = new Trainer(1, {}, null, 19).checkpoint();
  delete previous.physicsVersion;
  previous.episodes = 900;
  const current = new Trainer(1, {}, previous, 21);
  assert.equal(current.episodes, 0);
  assert.equal(current.checkpoint().physicsVersion, PHYSICS_VERSION);
  assert.notDeepEqual(current.policy.actor.w, previous.policy.actor);
  env.reset();
  assert.equal(env.force, 0);
});

test('servo limits peak time, recovers reserve under reduced demand and preserves high-speed braking', () => {
  const drive = new ServoDrive();
  let aboveContinuous = 0;
  for (let i = 0; i < 200; i++) {
    if (drive.step(80, 0, .005) > CONTINUOUS_FORCE + 1e-9) aboveContinuous += .005;
  }
  assert.ok(aboveContinuous <= .2 + 1e-9);
  assert.ok(Math.abs(drive.force) <= 40);
  for (let i = 0; i < 220; i++) drive.step(0, 0, .005);
  assert.ok(drive.reserve > .19);
  assert.ok(new ServoDrive().step(80, 2, .02) <= 40);
  assert.equal(new ServoDrive().step(80, 3, .02), 0);
  assert.equal(new ServoDrive().step(80, 4, .02), 0);
  assert.ok(new ServoDrive().step(-80, 4, .02) < 0);
});

test('terminal does not fire at upright success; all absolute angles must qualify for 20 seconds', () => {
  assert.equal(HOLD_SECONDS, 20);
  assert.ok(EVAL_SECONDS > HOLD_SECONDS);
  const env = new CartPole(2, () => .5, {gravity: 0});
  env.links[0].setTransform({x: 0, y: LENGTHS[0] / 2}, 0);
  env.links[1].setTransform({x: 0, y: LENGTHS[0] + LENGTHS[1] / 2}, 0);
  for (let i = 0; i < 999; i++) env.step(0, 30);
  assert.equal(env.result().success, false);
  const next = env.step(0, 30);
  assert.equal(env.result().hold, 20);
  assert.equal(env.result().success, true);
  assert.equal(next.terminated || next.truncated, false);
});

test('PPO consumes distinct environment streams and restores optimizer and deterministic predictions', () => {
  const trainer = new Trainer(1, {envs: 5, seconds: 20}, undefined, 1729);
  assert.ok(Math.abs(Math.exp(trainer.policy.logStd[0]) - 1.1) < 1e-9);
  assert.equal(trainer.policy.settings.entropy, .008);
  assert.notDeepEqual(trainer.envs[0].observe(), trainer.envs[1].observe());
  const initial = trainer.policy.checkpoint();
  for (let i = 0; i < 64; i++) trainer.collect();
  assert.deepEqual(trainer.streams.map(r => r.length), [64, 64, 64, 64, 64]);
  for (const _ of trainer.update()) {}
  const saved = structuredClone(trainer.checkpoint());
  assert.equal(saved.steps, 320);
  assert.equal(saved.policy.updates, 1);
  assert.ok(Math.exp(saved.policy.logStd[0]) >= .399);
  assert.notDeepEqual(saved.policy.actor, initial.actor);
  assert.notDeepEqual(saved.policy.critic, initial.critic);
  assert.ok(saved.policy.actorAdam.t > 0);
  assert.notDeepEqual(saved.policy.logStd, initial.logStd);
  trainer.configure({envs: 1, seconds: 20});
  assert.deepEqual(trainer.policy.checkpoint(), saved.policy);
  const restored = new Trainer(1, {envs: 1}, saved);
  const run = () => {
    const it = evaluate(1, obs => restored.policy.predict(obs));
    let r;
    do { r = it.next(); } while (!r.done);
    return r.value;
  };
  assert.deepEqual(run(), run());
  assert.deepEqual(restored.policy.checkpoint(), saved.policy);
  assert.throws(() => new Trainer(2, {}, saved), /다른 레벨/);
});

test('worker evaluates, trains and applies setting changes at a rollout boundary', {timeout: 30000}, async () => {
  const path = new URL('../cartpole-evolution-worker.mjs', import.meta.url).href;
  const worker = new Worker(`
    import {parentPort} from 'node:worker_threads';
    globalThis.postMessage = message => parentPort.postMessage(message);
    globalThis.onmessage = null;
    await import(${JSON.stringify(path)});
    parentPort.on('message', data => onmessage({data}));
  `, {eval: true});
  const history = [];
  worker.on('message', m => history.push(m));
  const wait = predicate => new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Worker message timeout')), 10000);
    function finish(error, value) {
      clearTimeout(timer);
      worker.off('message', onMessage);
      worker.off('error', finish);
      if (error) reject(error); else resolve(value);
    }
    function onMessage(m) {
      if (m.type === 'error') finish(new Error(m.message));
      else if (predicate(m)) finish(null, m);
    }
    worker.on('message', onMessage);
    worker.on('error', finish);
  });
  try {
    worker.postMessage({type: 'init', level: 1, config: {envs: 2}});
    await wait(m => m.type === 'ready');
    worker.postMessage({type: 'evaluate'});
    const baseline = await wait(m => m.type === 'checkpoint' && m.checkpoint.evaluation);
    assert.equal(baseline.checkpoint.policy.updates, 0);
    worker.postMessage({type: 'start', count: 1000});
    await wait(m => m.type === 'stats' && m.steps > 0);
    worker.postMessage({type: 'config', config: {envs: 5, seconds: 25}});
    await wait(m => m.type === 'stats' && m.envs === 5);
    worker.postMessage({type: 'pause'});
    await wait(m => m.type === 'state' && m.state === 'paused');
    const latest = history.filter(m => m.type === 'checkpoint').at(-1).checkpoint;
    assert.ok(latest.policy.updates >= 1);
    assert.notDeepEqual(latest.policy.actor, baseline.checkpoint.policy.actor);
    const plan = wait(m => m.type === 'stats' && m.target - m.planStart === 3);
    worker.postMessage({type: 'start', count: 3});
    const {target} = await plan;
    await wait(m => m.type === 'state' && m.state === 'complete');
    const final = history.filter(m => m.type === 'checkpoint').at(-1).checkpoint;
    assert.equal(final.episodes, target);
    assert.ok(final.policy.updates > latest.policy.updates);
    const evaluated = await wait(m => m.type === 'checkpoint' && m.checkpoint.evaluation?.updates === final.policy.updates);
    assert.equal(evaluated.checkpoint.evaluation.attempts, 8);
  } finally {
    await worker.terminate();
  }
});

test('old shared navigation gains one valid menu and leaves custom labels and settings intact', () => {
  const old = DEFAULT_MENUS.filter(m => m.id !== 'cartpole-evolution');
  const updated = validateMenus(withCartPoleEvolution(old));
  assert.deepEqual(updated.filter(m => m.id !== 'cartpole-evolution'), old);
  assert.equal(withCartPoleEvolution(updated), updated);
  const html = readFileSync(new URL('../cartpole-evolution.html', import.meta.url), 'utf8');
  for (const id of ['sidebar', 'menu-toggle', 'sidebar-backdrop', 'cpe-canvas', 'cpe-train', 'cpe-model', 'cpe-level', 'cpe-count']) {
    assert.ok(html.includes('id="' + id + '"'));
  }
});

test('preview holds a frozen policy, matches real time at 120 Hz and completes at the episode boundary', () => {
  const snapshot = new Trainer(1, {}, null, 871).policy.checkpoint();
  snapshot.actor.fill(0);
  const preview = new PreviewEpisode(1, 5, snapshot, false, 871);
  snapshot.actor.fill(1);
  let frame;
  for (let i = 0; i < 120; i++) frame = preview.frame(1 / 120);
  assert.ok(Math.abs(frame.time - 1) < 1e-9);
  assert.ok(preview.policy.actor.w.every(v => v === 0));
  assert.equal(frame.force, 0);
  assert.equal(preview.done, false);
  for (let i = 0; i < 481; i++) frame = preview.frame(1 / 120);
  assert.equal(frame.time, 5);
  assert.equal(preview.done, true);
});

test('portrait and landscape use the same model scale and a fixed rail', () => {
  for (const level of [1, 5]) {
    for (const [width, height] of [[320, 300], [730, 252]]) {
      const left = railProjection(width, height, level, -2.4);
      const right = railProjection(width, height, level, 2.4);
      assert.equal(left.railX(-2.4), right.railX(-2.4));
      assert.ok(left.railX(-2.4) > 0 && right.railX(2.4) < width);
      assert.equal(right.modelX(2.4), right.railX(2.4));
      assert.ok(Math.abs(left.modelX(-2.4 + left.reach) - left.modelX(-2.4) - 105 * level) < 1e-9);
      assert.ok(Math.abs(right.modelY(0) - right.modelY(right.reach) - 105 * level) < 1e-9);
    }
  }
});

test('external pulses change physical velocity without adding elapsed time or updating policy', () => {
  const env = new CartPole(2, () => .75);
  const before = env.observe();
  const hit = env.impact(5, true);
  assert.equal(env.steps, 0);
  assert.equal(hit.body, 0);
  assert.notDeepEqual(env.observe(), before);
  const trainer = new Trainer(1, {envs: 1, impactEnabled: true, impactInterval: .2, impactLoad: 2}, null, 77);
  for (let i = 0; i < 12; i++) trainer.collect();
  assert.ok(trainer.envs[0].lastImpact);
  assert.equal(trainer.streams[0].length, 12);
  assert.equal(trainer.policy.updates, 0);
  assert.equal(trainer.envs[0].steps, 12);
});

test('random impacts stay in load bounds and strike only the left or right cart side', () => {
  const trainer = new Trainer(5, {}, null, 547);
  const env = trainer.envs[0], sides = new Set();
  const config = options({impactMin: 3, impactMax: 7});
  for (let i = 0; i < 100; i++) {
    const hit = env.randomImpact(config);
    assert.ok(hit.load >= 3 && hit.load <= 7);
    assert.equal(hit.body, 0);
    assert.equal(hit.localX, -hit.direction * .18);
    sides.add(hit.direction);
    env.reset();
  }
  assert.deepEqual([...sides].sort(), [-1, 1]);
  assert.equal(options({impactMin: 9, impactMax: 1}).impactMin, 1);
  assert.equal(options({impactMin: 9, impactMax: 1}).impactMax, 9);
});

test('hammer speed follows the selected load range and the impulse waits for contact', () => {
  const snapshot = new Trainer(1, {}, null, 19).policy.checkpoint();
  snapshot.actor.fill(0);
  function viewer(strength) {
    const preview = new PreviewEpisode(1, 30, snapshot, false, 19);
    preview.policy.random.uniform = () => strength;
    preview.impact({impactMin: 1, impactMax: 9, impactInterval: 3});
    return preview;
  }
  const soft = viewer(.1), hard = viewer(.9);
  assert.ok(soft.pendingHit.duration > hard.pendingHit.duration);
  assert.equal(hard.env.lastImpact, null);
  const end = hard.pendingHit.end;
  for (let i = 0; i < 4; i++) hard.frame(.1);
  assert.ok(hard.env.lastImpact);
  assert.equal(hard.env.lastImpact.body, hard.pendingHit.body);
  assert.equal(hard.env.lastImpact.direction, hard.pendingHit.direction);
  assert.ok(Math.abs(hard.env.lastImpact.load - 8.2) < 1e-9);
  assert.ok(hard.env.lastImpact.time >= hard.pendingHit.contact);
  while (hard.env.steps * DT <= end + DT) hard.frame(.02);
  assert.equal(hard.pendingHit, null);
});

test('mixed training starts include down, tilted and upright from the first batch', () => {
  const trainer = new Trainer(1, {envs: 5}, null, 791);
  const kinds = new Set();
  for (let i = 0; i < 60; i++) {
    const env = trainer.envs[i % 5];
    kinds.add(env.startKind);
    env.reset();
  }
  assert.deepEqual([...kinds].sort(), ['down', 'tilted', 'upright']);
});

test('post-acquisition fast rotations cost more; sustained post-impact balance earns more', () => {
  const pose = (angle, speed, acquired, impacted) => {
    const env = new CartPole(1, () => .5, {gravity: 0, damping: 0});
    const body = env.links[0];
    body.setTransform({x: -.325 * Math.sin(angle), y: .325 * Math.cos(angle)}, angle);
    body.setAngularVelocity(speed);
    env.acquired = acquired;
    if (impacted) env.impact(0);
    return {env, reward: env.step(0, 30).reward};
  };
  assert.ok(pose(1, 6, false, false).reward > pose(1, 6, true, false).reward);
  assert.ok(pose(0, 0, true, true).reward > pose(1, 6, true, true).reward);
  const env = pose(0, 0, false, false).env;
  for (let i = 0; i < 12; i++) env.step(0, 30);
  assert.equal(env.acquired, true);
  env.reset();
  assert.equal(env.acquired, false);
});

test('recovery rewards favor stabilization, allow vigorous cart control and discourage rail-edge drift', () => {
  const state = {angle: .15, speed: 1, stability: .7, mean: .99, all: .99, x: 0,
    action: 1, acquired: true, impacted: true, progress: .1, recovered: 0};
  const improving = postureReward(state);
  const worsening = postureReward({...state, progress: -.1});
  assert.ok(improving.recovery > worsening.recovery);
  assert.equal(improving.control, -.001);
  assert.ok(Math.abs(improving.control) < improving.posture / 100);
  assert.ok(postureReward({...state, x: 4.8}).position < postureReward({...state, x: 2}).position - .5);
  assert.ok(postureReward({...state, angle: 2, speed: 5}).rotation > -.1);
});
