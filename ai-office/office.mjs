import { openConversation } from './conversation.mjs?v=manual1';
import { employees, rooms, TILE, WIDTH, HEIGHT } from './office-map.mjs';
import { actorStatus, createDemoSource, createMotion } from './office-motion.mjs';
import { createBackground, drawOffice, drawPortrait } from './office-art.mjs';

const canvas = document.getElementById('office-canvas');
const ctx = canvas.getContext('2d');
const background = createBackground(employees);
const motion = createMotion(employees);
const source = createDemoSource();
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const pauseButton = document.getElementById('motion');
const scenes = [...document.querySelectorAll('[data-scene]')];
const sceneStatus = document.getElementById('scene-status');
const dialog = document.getElementById('employee-dialog');
const employeeState = document.getElementById('employee-state');
const staff = document.getElementById('office-staff');
const targets = document.getElementById('office-targets');
const zones = document.getElementById('office-zones');
const labels = {
  standing: '일어나는 중', walking: '이동 중', working: '책상 업무',
  meeting: '회의 참석', resting: '휴식 중', coffee: '커피 마시는 중',
};
const sceneLabels = { work: '책상 업무', meeting: '회의 이동', break: '휴식' };
let paused = motionPreference.matches;
let time = 0;
let lastFrame = null;
let frame = null;
let currentEmployee = null;
let opener = null;

function showEmployee(actor, trigger) {
  const { employee } = actor;
  currentEmployee = employee.id;
  opener = trigger;
  for (const field of ['name', 'role', 'duties', 'style']) {
    document.getElementById('employee-' + field).textContent = employee[field];
  }
  employeeState.textContent = labels[actorStatus(actor)];
  drawPortrait(document.getElementById('employee-portrait'), employee);
  openConversation(employee.id);
  dialog.showModal();
}

dialog.addEventListener('close', () => {
  currentEmployee = null;
  opener?.focus();
});

const signs = [...rooms, { name: '출입구', x: 27, y: 8, w: 2 }];
for (const room of signs) {
  const zone = document.createElement('span');
  zone.className = 'office-zone';
  zone.textContent = room.name;
  zone.style.left = ((room.x + room.w / 2) * TILE / WIDTH * 100) + '%';
  zone.style.top = ((room.y * TILE + 3) / HEIGHT * 100) + '%';
  zones.append(zone);
}

const employeeViews = new Map();
for (const actor of motion.actors) {
  const { employee } = actor;
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'office-staff-button';
  const portrait = document.createElement('canvas');
  portrait.width = 32;
  portrait.height = 36;
  portrait.setAttribute('aria-hidden', 'true');
  drawPortrait(portrait, employee);
  const name = document.createElement('strong');
  name.textContent = employee.name;
  const role = document.createElement('small');
  role.textContent = employee.role;
  const state = document.createElement('span');
  state.className = 'office-person-state';
  button.append(portrait, name, role, state);
  button.addEventListener('click', () => showEmployee(actor, button));
  item.append(button);
  staff.append(item);

  const target = document.createElement('button');
  target.type = 'button';
  target.className = 'office-actor';
  target.dataset.employee = employee.id;
  target.setAttribute('aria-label', employee.name + ' · ' + employee.role);
  target.addEventListener('click', () => showEmployee(actor, target));
  targets.append(target);
  employeeViews.set(employee.id, { state, target });
}

function render() {
  const sorted = drawOffice(ctx, background, motion.actors, time);
  sorted.forEach(({ actor, anchor: [x, y] }, index) => {
    const { target, state } = employeeViews.get(actor.employee.id);
    target.style.left = (x / WIDTH * 100) + '%';
    target.style.top = (y / HEIGHT * 100) + '%';
    target.style.zIndex = index + 1;
    const label = labels[actorStatus(actor)];
    if (state.textContent !== label) state.textContent = label;
    if (currentEmployee === actor.employee.id && employeeState.textContent !== label) employeeState.textContent = label;
  });
}

function animate(now) {
  frame = null;
  if (lastFrame === null) lastFrame = now;
  const elapsed = now - lastFrame;
  if (elapsed >= 30) {
    const dt = Math.min(elapsed, 64);
    lastFrame = now;
    time += dt;
    motion.update(dt);
    render();
  }
  syncAnimation();
}

function syncAnimation() {
  if (paused || document.hidden) {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = lastFrame = null;
  } else if (frame === null) {
    frame = requestAnimationFrame(animate);
  }
}

function setPause(next) {
  paused = next;
  pauseButton.setAttribute('aria-pressed', String(paused));
  pauseButton.firstElementChild.textContent = paused ? '▶' : 'Ⅱ';
  pauseButton.lastElementChild.textContent = paused ? '재생' : '일시정지';
  syncAnimation();
}

function displaySnapshot(snapshot) {
  motion.applySnapshot(snapshot, paused);
  sceneStatus.textContent = sceneLabels[snapshot.scene] + ' 장면 · 데모';
  for (const button of scenes) button.setAttribute('aria-pressed', String(button.dataset.scene === snapshot.scene));
  render();
}

for (const button of scenes) button.addEventListener('click', () => source.setScene(button.dataset.scene));
pauseButton.addEventListener('click', () => setPause(!paused));
motionPreference.addEventListener('change', event => setPause(event.matches));
document.addEventListener('visibilitychange', syncAnimation);
source.subscribe(displaySnapshot);
displaySnapshot(source.getSnapshot());
setPause(paused);
