export const REWARD = Object.freeze({ pass: 10, emptyJump: 3, crash: 10, clear: 50 });

export function reward(level, previousX, state) {
  const delta = state.score - (state.rewardScore ?? 0);
  state.rewardScore = state.score;
  return delta - (state.status === 'crashed' ? REWARD.crash : 0)
    + (state.status === 'cleared' ? REWARD.clear : 0);
}
