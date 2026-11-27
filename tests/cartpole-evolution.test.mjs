import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {CartPole, DT, GRAVITY, LENGTHS, MASSES, MAX_FORCE, inputSize} from '../cartpole-evolution-core.mjs';
import {Trainer, evaluate} from '../cartpole-evolution-training.mjs';
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
      let prevY = 0;
      env.links.forEach((b, i) => {
        assert.ok(b.getPosition().y < prevY);
        assert.ok(Math.abs(b.getMass() - MASSES[i]) < 1e-9);
        assert.ok(Math.abs(b.getInertia() - MASSES[i] * (LENGTHS[i] ** 2 + .022 ** 2) / 12) < 1e-9);
        assert.equal(env.joints[i].isMotorEnabled(), false);
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
      return error;
    });
    assert.ok(errors[1] < errors[0] && errors[1] < .002);
  }
});

test('force moves cart and reacts through passive pole; timeout bootstraps and boundary terminates', () => {
  const env = new CartPole(1, () => .5);
  env.step(2, 20);
  assert.equal(env.force, MAX_FORCE);
  assert.ok(env.cart.getPosition().x > 0 && env.cart.getLinearVelocity().x > 0);
  assert.ok(Math.abs(env.links[0].getAngularVelocity()) > .01);
  while (!env.step(1, 20).terminated) {}
  assert.ok(env.maxTravel > 2.4);
  env.reset();
  for (let i = 0; i < 249; i++) assert.equal(env.step(0, 5).truncated, false);
  assert.deepEqual([env.step(0, 5).truncated, env.result().success], [true, false]);
});

test('terminal does not fire at upright success; all absolute angles must qualify for five seconds', () => {
  const env = new CartPole(2, () => .5, {gravity: 0});
  env.links[0].setTransform({x: 0, y: LENGTHS[0] / 2}, 0);
  env.links[1].setTransform({x: 0, y: LENGTHS[0] + LENGTHS[1] / 2}, 0);
  for (let i = 0; i < 249; i++) env.step(0, 20);
  assert.equal(env.result().success, false);
  const next = env.step(0, 20);
  assert.equal(env.result().hold, 250 * DT);
  assert.equal(env.result().success, true);
  assert.equal(next.terminated || next.truncated, false);
});

test('PPO consumes distinct environment streams and restores optimizer and deterministic predictions', () => {
  const trainer = new Trainer(1, {envs: 5, seconds: 20}, undefined, 1729);
  assert.notDeepEqual(trainer.envs[0].observe(), trainer.envs[1].observe());
  const initial = trainer.policy.checkpoint();
  for (let i = 0; i < 64; i++) trainer.collect();
  assert.deepEqual(trainer.streams.map(r => r.length), [64, 64, 64, 64, 64]);
  for (const _ of trainer.update()) {}
  const saved = structuredClone(trainer.checkpoint());
  assert.equal(saved.steps, 320);
  assert.equal(saved.policy.updates, 1);
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

test('worker evaluates, trains and applies setting changes at a rollout boundary', {timeout: 15000}, async () => {
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
    const timer = setTimeout(() => finish(new Error('Worker message timeout')), 4500);
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
    worker.postMessage({type: 'speed', speed: 0});
    worker.postMessage({type: 'start'});
    await wait(m => m.type === 'stats' && m.steps > 0);
    worker.postMessage({type: 'config', config: {envs: 5, seconds: 10}});
    await wait(m => m.type === 'frame' && m.frames.length === 5);
    worker.postMessage({type: 'pause'});
    await wait(m => m.type === 'state' && m.state === 'paused');
    const latest = history.filter(m => m.type === 'checkpoint').at(-1).checkpoint;
    assert.ok(latest.policy.updates >= 1);
    assert.notDeepEqual(latest.policy.actor, baseline.checkpoint.policy.actor);
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
  for (const id of ['sidebar', 'menu-toggle', 'sidebar-backdrop', 'cpe-canvas', 'cpe-train', 'cpe-representative']) {
    assert.ok(html.includes('id="' + id + '"'));
  }
});
