export const STEP = 1 / 60;
export const PHYSICS_VERSION = 1;
export const SIZE = 24;
export const DECISION_STEPS = 3;
export const INPUTS = 19;
const GRAVITY = 1440;
const JUMP_SPEED = 510;
const RANGE = 440;

export function validateLevels(levels) {
  if (!Array.isArray(levels) || levels.length === 0) throw Error('스테이지 데이터가 없습니다.');
  const ids = new Set();
  for (const level of levels) {
    const { id, name, version, start, end, speed, length, obstacles } = level;
    if (typeof id !== 'string' || ids.has(levelKey(level)) || !name || !Number.isInteger(version)
      || ![start, end, speed, length].every(Number.isFinite) || speed <= 0
      || end <= start || end - start !== length || !obstacles?.length) throw Error('스테이지 데이터 오류');
    let previous = start + SIZE;
    for (const { x, type, w, h } of obstacles) {
      if (![x, w, h].every(Number.isFinite) || x < previous || x + w > end
        || w <= 0 || h <= 0 || !['spike', 'block', 'ramp', 'trapezoid'].includes(type)) throw Error('장애물 데이터 오류');
      previous = x + w;
    }
    ids.add(levelKey(level));
  }
  return levels;
}

export const levelKey = level => level.id + ':' + level.version;

export async function loadLevels() {
  const response = await fetch(new URL('./levels.json?v=3', import.meta.url));
  if (!response.ok) throw Error('스테이지를 불러올 수 없습니다.');
  return validateLevels(await response.json());
}

export function initialState(level, offset = 0) {
  return { x: level.start + offset, y: 0, vy: 0, grounded: true, tick: 0,
    passed: 0, status: 'running', hit: null, angle: 0 };
}

export function progress(level, state) {
  return Math.max(0, Math.min(1, (state.x - level.start) / level.length));
}

export function obstacleVertices({ x, w, h, type }) {
  const base = [[x, 0], [x + w, 0]];
  switch (type) {
    case 'spike': return [...base, [x + w / 2, h]];
    case 'ramp': return [...base, [x + w, h]];
    case 'trapezoid': return [...base, [x + w * .79, h], [x + w * .29, h]];
    default: return [...base, [x + w, h], [x, h]];
  }
}

// Convex polygon SAT, including the rotating cube and actual obstacle slopes.
function intersects(cube, obstacle) {
  const shape = obstacleVertices(obstacle);
  for (const polygon of [cube, shape]) {
    for (let i = 0; i < polygon.length; i++) {
      const [a, b] = polygon[i];
      const [c, d] = polygon[(i + 1) % polygon.length];
      const project = ([px, py]) => px * (b - d) + py * (c - a);
      const p = cube.map(project);
      const q = shape.map(project);
      if (Math.max(...p) <= Math.min(...q) || Math.max(...q) <= Math.min(...p)) return false;
    }
  }
  return true;
}

export function step(level, state, jump = false) {
  if (state.status !== 'running') return state;
  const launched = jump && state.grounded;
  state.x += level.speed * STEP;
  state.tick++;
  if (!state.grounded || launched) {
    state.vy = (launched ? JUMP_SPEED : state.vy) - GRAVITY * STEP;
    state.y = Math.max(0, state.y + state.vy * STEP);
    state.grounded = state.y === 0;
    if (state.grounded) state.vy = 0;
    state.angle = state.grounded ? 0 : state.angle + Math.PI / 42;
  }
  const center = state.x + SIZE / 2;
  const cos = Math.cos(state.angle);
  const sin = Math.sin(state.angle);
  const radius = SIZE / 2;
  const extent = radius * (Math.abs(cos) + Math.abs(sin));
  const cy = Math.max(state.y + radius, extent);
  while (level.obstacles[state.passed]?.x + level.obstacles[state.passed]?.w < center - extent) {
    state.passed++;
  }
  for (let i = state.passed; i < level.obstacles.length; i++) {
    const obstacle = level.obstacles[i];
    if (obstacle.x >= center + extent) break;
    if (obstacle.h <= cy - extent) continue;
    const cube = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) =>
      [center + radius * (a * cos - b * sin), cy + radius * (a * sin + b * cos)]);
    if (intersects(cube, obstacle)) {
      state.status = 'crashed';
      state.hit = i;
      return state;
    }
  }
  if (state.x >= level.end) state.status = 'cleared';
  return state;
}

export function observe(level, state) {
  const input = [state.y / 100, state.vy / JUMP_SPEED, +state.grounded, level.speed / 350];
  for (let i = 0; i < 3; i++) {
    const obstacle = level.obstacles[state.passed + i];
    const distance = obstacle ? obstacle.x - state.x - SIZE : Infinity;
    if (distance <= RANGE) input.push(distance / RANGE, obstacle.h / 80, obstacle.w / 70, ({ spike: 0, block: 1, ramp: .33, trapezoid: .67 })[obstacle.type], 1);
    else input.push(1, 0, 0, 0, 0);
  }
  return input;
}

export function advance(level, state, action, count = DECISION_STEPS) {
  for (let i = 0; i < count && state.status === 'running'; i++) step(level, state, i === 0 && action === 1);
  return state;
}
