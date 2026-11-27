export const REWARD = Object.freeze({ distance: 2, crash: 1, clear: 2, jump: 0.012 });

export function reward(level, previousX, state, launched) {
  return (state.x - previousX) / level.length * REWARD.distance
    - (state.status === 'crashed' ? REWARD.crash : 0)
    + (state.status === 'cleared' ? REWARD.clear : 0)
    - (launched ? REWARD.jump : 0);
}
