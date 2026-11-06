import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, failed, initialState, rollout, PolicySearch, MAX_STEPS } from '../cartpole-core.mjs';
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
    assert.equal(learner.history.length, 30);
  }
});
