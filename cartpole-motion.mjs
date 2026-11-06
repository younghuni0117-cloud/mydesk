// Passive post-failure dynamics with floor contact. These frames do not earn reward.
import { DT, X_LIMIT, environment, advanceWithDelta } from './cartpole-core.mjs?v=reward1';
export const PIVOT_HEIGHT = .32;
export const CONTACT_RADIUS = .045;
export function poleLengths(difficulty = 'normal') {
  const c = environment(difficulty);
  return c.poles === 2 ? [c.length, c.secondLength] : [2 * c.length];
}
export function polePoints(state, difficulty = 'normal') {
  const points = [{ x: state[0], y: PIVOT_HEIGHT }];
  for (const [i, length] of poleLengths(difficulty).entries()) {
    const p = points.at(-1), angle = state[2 + i * 2];
    points.push({ x: p.x + length * Math.sin(angle), y: p.y + length * Math.cos(angle) });
  }
  return points;
}
function inverseMass(state, c) {
  if (c.poles === 1) {
    const a = 1.1, b = .1 * c.length * Math.cos(state[2]), d = .1 * 4 * c.length ** 2 / 3;
    const det = a * d - b * b;
    return [[d / det, -b / det], [-b / det, a / det]];
  }
  const a = 1.22, b = .16 * c.length * Math.cos(state[2]), cc = .05 * c.secondLength * Math.cos(state[4]);
  const d = .14 * c.length ** 2, e = .05 * c.length * c.secondLength * Math.cos(state[2] - state[4]), f = .1 * c.secondLength ** 2 / 3;
  const aa = d * f - e * e, ab = cc * e - b * f, ac = b * e - cc * d;
  const dd = a * f - cc * cc, de = b * cc - a * e, ff = a * d - b * b;
  const det = a * aa + b * ab + cc * ac;
  return [[aa, ab, ac], [ab, dd, de], [ac, de, ff]].map(row => row.map(v => v / det));
}
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const multiply = (matrix, vector) => matrix.map(row => dot(row, vector));
function velocities(state) { return state.filter((_, i) => i % 2); }
function apply(state, vector, amount, offset) {
  vector.forEach((v, i) => { state[i * 2 + offset] += v * amount; });
}
function jacobian(state, lengths, index, horizontal = false) {
  return [horizontal ? 1 : 0, ...lengths.map((l, i) => i < index ? l * (horizontal ? Math.cos(state[2 + i * 2]) : -Math.sin(state[2 + i * 2])) : 0)];
}
export function advanceAfterFailure(state, difficulty = 'normal', dt = DT) {
  const c = environment(difficulty), lengths = poleLengths(c);
  let s = [...state], impacts = 0, grounded = false;
  const h = dt / 4;
  for (let sub = 0; sub < 4; sub++) {
    s = advanceWithDelta(s, 0, c, h);
    if (Math.abs(s[0]) > X_LIMIT) {
      const sign = s[0] > 0 ? -1 : 1, J = [sign, ...Array(c.poles).fill(0)], invJ = multiply(inverseMass(s, c), J);
      const speed = dot(J, velocities(s));
      if (speed < 0) apply(s, invJ, -(1.2 * speed) / dot(J, invJ), 1);
      s[0] = Math.max(-X_LIMIT, Math.min(X_LIMIT, s[0]));
    }
    // Sequential impulses and position projection handle both serial joints.
    for (let iteration = 0; iteration < 8; iteration++) {
      const points = polePoints(s, c);
      for (let i = 1; i < points.length; i++) {
        const penetration = CONTACT_RADIUS - points[i].y;
        if (penetration < -1e-5) continue;
        grounded = true;
        const J = jacobian(s, lengths, i), inv = inverseMass(s, c), invJ = multiply(inv, J), denominator = dot(J, invJ);
        if (denominator < 1e-9) continue;
        const normalSpeed = dot(J, velocities(s));
        if (normalSpeed < 0) {
          const restitution = normalSpeed < -.2 ? .38 : 0;
          const impulse = -(1 + restitution) * normalSpeed / denominator;
          apply(s, invJ, impulse, 1);
          if (restitution) impacts++;
          const tangent = jacobian(s, lengths, i, true), freeT = multiply(inv, tangent);
          // Tangential friction must not undo the normal restitution impulse.
          const coupling = dot(J, freeT) / denominator;
          const invT = freeT.map((v, k) => v - invJ[k] * coupling), tangentMass = dot(tangent, invT);
          if (tangentMass > 1e-9) {
            const friction = Math.max(-.45 * impulse, Math.min(.45 * impulse, -dot(tangent, velocities(s)) / tangentMass));
            apply(s, invT, friction, 1);
          }
        }
        if (penetration > 0) apply(s, invJ, (penetration + 1e-7) / denominator, 0);
      }
    }
    s[1] *= .994;
    for (let i = 0; i < c.poles; i++) s[3 + i * 2] *= .998;
  }
  return { state: s, impacts, grounded, speed: Math.max(...velocities(s).map(Math.abs)) };
}
export function sceneProjection(state, difficulty = 'normal') {
  const points = polePoints(state, difficulty);
  const min = Math.min(-X_LIMIT - .1, ...points.map(p => p.x)) - .15;
  const max = Math.max(X_LIMIT + .1, ...points.map(p => p.x)) + .15;
  const center = (min + max) / 2;
  const scale = Math.min(134.375, 720 / (max - min), 256 / (PIVOT_HEIGHT + poleLengths(difficulty).reduce((a,b) => a+b,0)));
  return { scale, floor: 291, x: value => 400 + (value - center) * scale, y: value => 291 - value * scale };
}
