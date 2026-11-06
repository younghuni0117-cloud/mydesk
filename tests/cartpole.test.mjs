import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, failed, initialState, rollout, PolicySearch, MAX_STEPS, evaluatePolicy, DIFFICULTIES } from '../cartpole-core.mjs';
function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
test('stationary balance and applied force follow cart-pole physics', () => {
  assert.deepEqual(advance([0, 0, 0, 0], 0), [0, 0, 0, 0]);
  const right = advance([0, 0, 0, 0], 1);
  assert.ok(right[1] > 0, 'right force accelerates the cart right');
  assert.ok(right[3] < 0, 'the pole initially rotates left relative to the cart');
  const state = [.1, -.3, .08, .2];
  const result = advance(state, 1), mirrored = advance(state.map(v => -v), -1);
  result.forEach((value, i) => assert.ok(Math.abs(value + mirrored[i]) < 1e-12));
});
test('angle, position and invalid state end a round', () => {
  assert.equal(failed([0, 0, .1, 0]), false);
  assert.equal(failed([2.41, 0, 0, 0]), true);
  assert.equal(failed([0, 0, 13 * Math.PI / 180, 0]), true);
  assert.equal(failed([NaN, 0, 0, 0]), true);
});
test('policy search learns to balance on previously unseen starts', () => {
  for (const seed of [1, 7, 42]) {
    const random = seeded(seed), learner = new PolicySearch(random);
    const evaluationStarts = Array.from({ length: 20 }, () => initialState(random));
    const average = weights => evaluationStarts.reduce((sum, start) => sum + rollout(weights, start), 0) / evaluationStarts.length;
    const before = average(learner.weights);
    for (let generation = 0; generation < 30; generation++) learner.trainGeneration();
    const after = average(learner.weights);
    assert.ok(after > before, `seed ${seed} improves from ${before} to ${after}`);
    assert.ok(after >= MAX_STEPS * .8, `seed ${seed} holds at least 16 seconds on average`);
    assert.equal(learner.episodes, 30 * 25 * 3);
    assert.equal(learner.generations, 30);
    assert.equal(learner.history.length, 31);
    assert.equal(evaluatePolicy(learner.weights).mean, learner.score);
    assert.ok(learner.history.every((v, i, a) => !i || v.best >= a[i - 1].best));
  }
});

test('double pole has two coupled independent joints and symmetric dynamics', () => {
  assert.deepEqual(advance([0, 0, 0, 0, 0, 0], 0, 'double'), [0, 0, 0, 0, 0, 0]);
  const state = [.1, -.2, .03, .1, -.04, -.1];
  const next = advance(state, .4, 'double');
  const mirrored = advance(state.map(v => -v), -.4, 'double');
  next.forEach((v, i) => assert.ok(Math.abs(v + mirrored[i]) < 1e-10));
  assert.notEqual(next[3], next[5], 'joints do not share a scripted angle or velocity');
  assert.ok(failed([0, 0, 0, 0, .4, 0], 'double'), 'upper joint can fail independently');
  assert.ok(failed([0, 0, .4, 0, 0, 0], 'double'), 'lower joint can fail independently');
});
test('difficulty changes actual physics and failure limits', () => {
  const state = [0, 0, .2, .1];
  assert.equal(failed(state, 'easy'), false);
  assert.equal(failed(state, 'hard'), true);
  assert.notDeepEqual(advance(state, 1, 'easy'), advance(state, 1, 'hard'));
  for (const [id, config] of Object.entries(DIFFICULTIES)) assert.equal(initialState(seeded(1), id).length, config.dimension);
});
test('double-pole policy search improves without a predefined controller', () => {
  const random = seeded(42), learner = new PolicySearch(random, 'double');
  const before = learner.score;
  for (let i = 0; i < 30; i++) learner.trainGeneration();
  assert.ok(learner.score > before * 3);
  assert.ok(learner.score >= MAX_STEPS * .7);
  assert.equal(learner.weights.length, 6);
  const heldOut = Array.from({length: 20}, () => initialState(random, 'double'));
  const average = heldOut.reduce((sum, s) => sum + rollout(learner.weights, s, 'double'), 0) / heldOut.length;
  assert.ok(average >= MAX_STEPS * .7, `unseen-start average ${average}`);
  assert.equal(learner.episodes, 49 * 3 * 30);
});
test('cancelled asynchronous generations do not publish partial models', async () => {
  const learner = new PolicySearch(seeded(2), 'double');
  const before = JSON.stringify({weights:learner.weights, mean:learner.mean, history:learner.history});
  let active = true;
  const result = await learner.trainGenerationAsync(async () => {active = false}, () => active);
  assert.equal(result, null);
  assert.equal(learner.generations, 0);
  assert.equal(before, JSON.stringify({weights:learner.weights, mean:learner.mean, history:learner.history}));
});
