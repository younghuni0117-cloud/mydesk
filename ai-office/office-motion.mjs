import { employees, isWalkable, tileKey } from './office-map.mjs';

const scenes = {
  work: ['desk', 'working'],
  meeting: ['meeting', 'meeting'],
  break: ['rest', 'resting'],
};

const neighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const distance = ([ax, ay], [bx, by]) => Math.abs(ax - bx) + Math.abs(ay - by);

export function findPath(start, goal, occupied = new Set()) {
  if (!isWalkable(start) || !isWalkable(goal) || occupied.has(tileKey(goal))) return [];
  const open = [{ point: start, steps: 0, score: distance(start, goal), parent: null }];
  const best = new Map([[tileKey(start), 0]]);
  while (open.length) {
    open.sort((a, b) => b.score - a.score || a.steps - b.steps);
    const node = open.pop();
    if (node.steps > best.get(tileKey(node.point))) continue;
    if (distance(node.point, goal) === 0) {
      const path = [];
      for (let step = node; step.parent; step = step.parent) path.push(step.point);
      return path.reverse();
    }
    for (const [dx, dy] of neighbors) {
      const point = [node.point[0] + dx, node.point[1] + dy];
      const key = tileKey(point);
      const steps = node.steps + 1;
      if (!isWalkable(point) || occupied.has(key) || steps >= (best.get(key) ?? Infinity)) continue;
      best.set(key, steps);
      open.push({ point, steps, score: steps + distance(point, goal), parent: node });
    }
  }
  return [];
}

// Sources publish visual intent by employee ID. Animation has no effect on the source.
export function createDemoSource() {
  let scene = 'work';
  const listeners = new Set();
  function getSnapshot() {
    const [location, activity] = scenes[scene];
    return {
      source: 'demo',
      scene,
      intents: employees.map(employee => ({
        employeeId: employee.id,
        destination: employee[location],
        activity: activity,
      })),
    };
  }
  return {
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScene(next) {
      if (!Object.hasOwn(scenes, next) || scene === next) return;
      scene = next;
      for (const listener of listeners) listener(getSnapshot());
    },
  };
}

const STEP_MS = 103;
export function createMotion(staff) {
  const actors = staff.map(employee => ({
    employee, tile: employee.desk, from: null, next: null, progress: 0,
    destination: employee.desk, activity: 'working', facing: 'south',
    stand: 0, retry: 0,
  }));
  let planningOffset = 0;
  function applySnapshot({ intents }, instant = false) {
    const byId = new Map(intents.map(intent => [intent.employeeId, intent]));
    for (const actor of actors) {
      const intent = byId.get(actor.employee.id);
      if (!intent || !isWalkable(intent.destination)) continue;
      const leaving = actorStatus(actor) !== 'walking' && distance(actor.tile, intent.destination) > 0;
      actor.destination = intent.destination;
      actor.activity = intent.activity;
      actor.retry = 0;
      if (leaving) actor.stand = 140;
      if (instant) {
        actor.tile = actor.destination;
        actor.from = actor.next = null;
        actor.progress = actor.stand = 0;
        actor.facing = 'south';
      }
    }
  }
  function update(dt) {
    for (const actor of actors) {
      actor.stand = Math.max(0, actor.stand - dt);
      actor.retry = Math.max(0, actor.retry - dt);
      if (!actor.next) continue;
      actor.progress = Math.min(1, actor.progress + dt / STEP_MS);
      if (actor.progress === 1) {
        actor.tile = actor.next;
        actor.from = actor.next = null;
        actor.progress = 0;
        if (distance(actor.tile, actor.destination) === 0) actor.facing = 'south';
      }
    }
    const occupied = new Set(actors.flatMap(actor => [actor.tile, actor.next].filter(Boolean).map(tileKey)));
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[(i + planningOffset) % actors.length];
      if (actor.next || actor.stand || actor.retry || distance(actor.tile, actor.destination) === 0) continue;
      const key = tileKey(actor.tile);
      occupied.delete(key);
      const [next] = findPath(actor.tile, actor.destination, occupied);
      occupied.add(key);
      if (next) {
        actor.from = actor.tile;
        actor.next = next;
        occupied.add(tileKey(next));
        const [x, y] = actor.tile;
        actor.facing = next[0] > x ? 'east' : next[0] < x ? 'west' : next[1] < y ? 'north' : 'south';
      } else {
        actor.retry = 160;
      }
    }
    planningOffset = (planningOffset + 1) % Math.max(actors.length, 1);
  }
  return { actors, applySnapshot, update };
}

export function actorStatus(actor) {
  if (actor.stand) return 'standing';
  return actor.next || distance(actor.tile, actor.destination) > 0 ? 'walking' : actor.activity;
}

export function actorPosition(actor) {
  if (!actor.next) return actor.tile;
  return actor.from.map((value, index) => value + (actor.next[index] - value) * actor.progress);
}
