import test from 'node:test';
import assert from 'node:assert/strict';
import { employees, isWalkable, tileKey } from '../ai-office/office-map.mjs';
import { actorStatus, createDemoSource, createMotion, findPath } from '../ai-office/office-motion.mjs';

const scenes = ['work', 'meeting', 'break'];

test('every employee can walk between their desk, meeting seat, and break position', () => {
  for (const employee of employees) {
    const points = [employee.desk, employee.meeting, employee.rest];
    for (const start of points) {
      for (const goal of points.filter(point => point !== start)) {
        const path = findPath(start, goal);
        assert.deepEqual(path.at(-1), goal, employee.id);
        assert.ok(path.every(isWalkable));
      }
    }
  }
});

test('demo scene changes reserve distinct walkable tiles and settle all employees', () => {
  const source = createDemoSource();
  const motion = createMotion(employees);
  source.subscribe(snapshot => motion.applySnapshot(snapshot));

  for (const initial of scenes) {
    for (const next of scenes.filter(scene => scene !== initial)) {
      source.setScene(initial);
      motion.applySnapshot(source.getSnapshot(), true);
      source.setScene(next);
      assert.equal(source.getSnapshot().source, 'demo');
      assert.ok(motion.actors.some(actor => actorStatus(actor) === 'standing'));
      for (let elapsed = 0; elapsed < 11000; elapsed += 34) {
        motion.update(34);
        const tiles = motion.actors.flatMap(actor => [actor.tile, actor.next].filter(Boolean));
        assert.ok(tiles.every(isWalkable));
        assert.equal(new Set(tiles.map(tileKey)).size, tiles.length);
      }
      assert.ok(motion.actors.every(actor => actorStatus(actor) === actor.activity), initial + ' to ' + next);
    }
  }
});

test('changing scenes mid-step keeps current reservations until movement reaches a tile', () => {
  const source = createDemoSource();
  const motion = createMotion(employees);
  source.subscribe(snapshot => motion.applySnapshot(snapshot));
  source.setScene('meeting');
  for (let i = 0; i < 13; i++) motion.update(34);
  const moving = motion.actors.filter(actor => actor.next);
  assert.ok(moving.length);
  const reserved = moving.map(actor => actor.next);
  source.setScene('work');
  assert.deepEqual(moving.map(actor => actor.next), reserved);
  for (let i = 0; i < 300; i++) motion.update(34);
  assert.deepEqual(motion.actors.map(actor => actor.tile), employees.map(employee => employee.desk));
});
