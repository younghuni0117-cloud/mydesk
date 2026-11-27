import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEFAULT_MENUS, withNeonJumpMenu } from '../navigation-data.mjs';
import { DQN, CONFIG, forward } from '../neon-jump/dqn.mjs';
import { advance, DECISION_STEPS, initialState, observe, progress, step, validateLevels } from '../neon-jump/physics.mjs';
import { compatible, runPolicy, Training } from '../neon-jump/training.mjs';

const levels = validateLevels(JSON.parse(readFileSync(new URL('../neon-jump/levels.json', import.meta.url))));
const level = levels.find(entry => entry.id === 'first-jump' && entry.version === 1);

test('navigation adds Neon Jump under experiments without replacing custom entries', () => {
  const old = DEFAULT_MENUS.filter(menu => menu.id !== 'neon-jump');
  const menus = withNeonJumpMenu(old);
  assert.deepEqual(menus.slice(0, -1), old);
  assert.equal(menus.at(-1).parent_id, 'experiments');
  assert.equal(withNeonJumpMenu(menus), menus);
  assert.equal(withNeonJumpMenu([]).length, 0);
});

test('updated and original stages can be cleared with physical inputs on the DQN decision grid', () => {
  for (const stage of levels) {
    const pending = [{ state: initialState(stage), actions: [] }];
    const visited = new Set();
    let solution;
    while (pending.length) {
      const { state, actions } = pending.shift();
      if (state.status === 'cleared') { solution = actions; break; }
      if (state.status === 'crashed' || visited.has(state.tick)) continue;
      visited.add(state.tick);
      for (const a of [0, 1]) {
        const next = { ...state };
        advance(stage, next, a);
        while (next.status === 'running' && !next.grounded) advance(stage, next, 0);
        pending.push({ state: next, actions: a ? [...actions, state.tick] : actions });
      }
    }
    assert.ok(solution, stage.name + ' is playable');
    const state = initialState(stage), input = new Set(solution);
    while (state.status === 'running') step(stage, state, input.has(state.tick));
    assert.equal(progress(stage, state), 1);
    assert.equal(state.status, 'cleared');
    assert.equal(state.passed, stage.obstacles.length);
    assert.ok(solution.every(tick => tick % DECISION_STEPS === 0));
  }
});

test('fixed time input produces no double jump and missing obstacles are masked', () => {
  const state = initialState(level), reference = initialState(level);
  step(level, state, true);
  step(level, reference, true);
  for (let i = 0; i < 12; i++) {
    step(level, state, true);
    step(level, reference, false);
  }
  assert.deepEqual(state, reference);
  assert.deepEqual(observe(level, initialState(level)).slice(4), [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0]);
});

test('Double DQN updates weights, replay and target and restores an exact training trajectory', () => {
  const first = new Training(level, 731);
  const original = first.agent.weights.slice();
  for (let i = 0; i < 800; i++) first.tick();
  assert.ok(first.agent.updates > 0);
  assert.notDeepEqual(first.agent.weights, original);
  assert.ok(first.agent.epsilon < 1);
  assert.ok(first.agent.replay.some(row => row.done));
  assert.ok(first.agent.replay.some(row => row.a === 1));
  assert.ok(first.agent.replay.some(row => row.a === 0));
  assert.deepEqual(Object.keys(first.agent.replay[0]), ['s', 'a', 'r', 'next', 'done']);
  const snapshot = structuredClone(first.snapshot());
  const second = new Training(level, 1, snapshot);
  for (let i = 0; i < 50; i++) { first.tick(); second.tick(); }
  assert.deepEqual(first.agent.snapshot(), second.agent.snapshot());
  assert.deepEqual(first.state, second.state);
  const before = first.agent.snapshot();
  const invalid = structuredClone(before);
  invalid.weights[0] = NaN;
  assert.throws(() => new DQN(1, invalid));

  const targetAgent = new DQN(42);
  const initial = targetAgent.target.slice();
  const s = observe(level, initialState(level));
  while (targetAgent.updates < CONFIG.targetEvery - 1) {
    targetAgent.remember({ s, a: 0, r: -1, next: s, done: true });
    targetAgent.optimize();
  }
  assert.deepEqual(targetAgent.target, initial);
  while (targetAgent.updates < CONFIG.targetEvery) {
    targetAgent.remember({ s, a: 0, r: -1, next: s, done: true });
    targetAgent.optimize();
  }
  assert.deepEqual(targetAgent.target, targetAgent.weights);
  assert.notDeepEqual(initial, targetAgent.target);
});

test('measures learned policy against initial and random policies and replays successful evaluation', () => {
  const training = new Training(level, 731);
  const initial = runPolicy(level, training.agent.weights);
  for (let i = 0; i < 16000 && !training.trained; i++) training.tick();
  const snapshot = structuredClone(training.agent.snapshot());
  const learned = runPolicy(level, training.best.weights);
  assert.deepEqual(learned, runPolicy(level, training.best.weights));
  assert.deepEqual(training.agent.snapshot(), snapshot);
  assert.equal(learned.cleared, true);
  assert.ok(learned.progress > initial.progress);
  const random = Array.from({ length: 24 }, (_, seed) => runPolicy(level, null, { randomSeed: seed + 318 }));
  const mean = random.reduce((sum, run) => sum + run.progress, 0) / random.length;
  assert.ok(learned.progress > mean);
  assert.ok(compatible(level, training.best.replay));
  const replay = initialState(level), inputs = new Set(training.best.replay.actions);
  while (replay.status === 'running') step(level, replay, inputs.has(replay.tick));
  assert.equal(replay.tick, learned.ticks);
  assert.equal(replay.status, 'cleared');
  assert.ok(forward(training.best.weights, observe(level, initialState(level))).at(-1).every(Number.isFinite));
  console.log(JSON.stringify({ initial: initial.progress, learned: learned.progress, randomMean: mean,
    randomClears: random.filter(row => row.cleared).length, episode: training.episode, updates: training.agent.updates }));
});
