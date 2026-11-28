import { COLS, ROWS, WIDTH, HEIGHT, TILE, furniture, rooms, isWall, isDoor } from './office-map.mjs';
import { actorPosition, actorStatus } from './office-motion.mjs';

const ink = '#293e3e';
const palettes = {
  honey: ['#ecd7ad', '#d7b88d', '#f4e1bf'],
  mint: ['#c2dbcc', '#a9c8bc', '#d3e5d8'],
  blue: ['#c3d5df', '#adbfce', '#d6e1e4'],
  lilac: ['#d7cce4', '#c5b6d6', '#e5daec'],
};

function rect(ctx, color, x, y, width, height) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), width, height);
}

function windowSprite(ctx, x, y, width) {
  rect(ctx, '#46645f', x, y, width, 15);
  rect(ctx, '#8fbec9', x + 2, y + 2, width - 4, 10);
  rect(ctx, '#b6dce2', x + 3, y + 3, width - 6, 4);
  rect(ctx, '#e2f1e9', x + 5, y + 4, 7, 2);
  rect(ctx, '#688f89', x + Math.floor(width / 2), y + 2, 2, 10);
  rect(ctx, '#e5ddd0', x - 1, y + 13, width + 2, 2);
}

function plant(ctx, x, y) {
  rect(ctx, '#b17059', x + 3, y + 10, 10, 6);
  rect(ctx, '#dc9d75', x + 2, y + 9, 12, 3);
  rect(ctx, '#3b7054', x + 7, y + 3, 2, 7);
  rect(ctx, '#3b7054', x + 3, y + 1, 5, 5);
  rect(ctx, '#77a568', x + 1, y - 1, 6, 4);
  rect(ctx, '#5b945d', x + 8, y + 1, 5, 5);
  rect(ctx, '#8db878', x + 9, y - 1, 5, 3);
}

function device(ctx, x, y, accent) {
  rect(ctx, ink, x, y, 17, 11);
  rect(ctx, accent, x + 2, y + 2, 13, 6);
  rect(ctx, '#d0ead8', x + 3, y + 3, 5, 1);
  rect(ctx, '#2f4947', x + 7, y + 11, 3, 3);
  rect(ctx, '#516664', x + 5, y + 13, 7, 1);
  rect(ctx, '#f7e7c7', x + 2, y + 15, 13, 2);
}

function chair(ctx, x, y, color) {
  rect(ctx, '#495b56', x - 6, y - 7, 12, 10);
  rect(ctx, color, x - 5, y - 6, 10, 7);
  rect(ctx, '#334e4b', x - 4, y + 3, 2, 2);
  rect(ctx, '#334e4b', x + 2, y + 3, 2, 2);
}

function rug(ctx, x, y, width, height, fill, trim) {
  rect(ctx, trim, x, y, width, height);
  rect(ctx, fill, x + 2, y + 2, width - 4, height - 4);
  for (let col = 5; col < width - 4; col += 7) {
    rect(ctx, trim, x + col, y + 4, 2, 2);
    rect(ctx, trim, x + col, y + height - 6, 2, 2);
  }
}

function drawRoom(ctx, { x, y, w, h, floor }) {
  const [base, seam, highlight] = palettes[floor];
  const left = x * TILE;
  const top = y * TILE;
  rect(ctx, base, left, top, w * TILE, h * TILE);
  for (let row = 0; row < h * 2; row++) {
    rect(ctx, seam, left, top + row * 8, w * TILE, 1);
    const offset = row % 2 ? 7 : 22;
    for (let col = offset; col < w * TILE; col += 29) {
      rect(ctx, seam, left + col, top + row * 8, 1, 8);
      rect(ctx, highlight, left + col - 5, top + row * 8 + 3, 3, 1);
    }
  }
  rect(ctx, '#54796f', left, top, w * TILE, 3);
  rect(ctx, '#85a79a', left, top + 3, w * TILE, 12);
  rect(ctx, '#aec2a8', left, top + 13, w * TILE, 2);
}

function drawFurniture(ctx, item) {
  const { type, accent } = item;
  const x = item.x * TILE;
  const y = item.y * TILE;
  const w = item.w * TILE;
  const h = item.h * TILE;
  if (type === 'plant') {
    plant(ctx, x, y);
    return;
  }
  rect(ctx, '#34453927', x + 3, y + h - 3, w - 2, 5);
  if (type === 'desk' || type === 'table') {
    rect(ctx, '#704d46', x + 2, y + 5, w - 4, 10);
    rect(ctx, '#94674b', x + 4, y + 9, 4, 7);
    rect(ctx, '#94674b', x + w - 8, y + 9, 4, 7);
    rect(ctx, '#8e624c', x + 1, y + 1, w - 2, 10);
    rect(ctx, '#d09d6a', x + 2, y, w - 4, 8);
    rect(ctx, '#edbd83', x + 3, y + 1, w - 6, 2);
    if (type === 'desk') {
      device(ctx, x + 8, y - 9, accent);
      rect(ctx, '#f7e5bd', x + w - 13, y + 3, 7, 4);
      rect(ctx, '#ac775b', x + w - 11, y + 4, 3, 1);
    } else {
      for (const dx of [13, 37, 63, 78]) rect(ctx, '#e9ddbf', x + dx, y + 3, 8, 4);
      rect(ctx, '#5f8772', x + 48, y + 2, 4, 5);
      rect(ctx, '#8bb089', x + 46, y + 1, 8, 3);
    }
  }
  if (type === 'shelf') {
    rect(ctx, '#674d48', x + 2, y - 6, w - 4, 21);
    rect(ctx, '#966e55', x + 3, y - 6, w - 6, 3);
    rect(ctx, '#bd956c', x + 4, y + 3, w - 8, 2);
    rect(ctx, '#bd956c', x + 4, y + 12, w - 8, 2);
    ['#d69567', '#8eb193', '#e7ca83', '#8897b5', '#bb7a6b'].forEach((color, i) => {
      rect(ctx, color, x + 5 + i * 4, y - 3 + i % 2, 3, 6 - i % 2);
      rect(ctx, color, x + 7 + i * 3, y + 6, 2, 6);
    });
  }
  if (type === 'bed') {
    rect(ctx, '#5f7e78', x + 2, y - 2, w - 4, h + 2);
    rect(ctx, '#e9f2e8', x + 4, y + 2, w - 8, h - 6);
    rect(ctx, '#89bfb0', x + 4, y + 12, w - 8, h - 16);
    rect(ctx, '#b5dbca', x + 5, y + 12, w - 10, 3);
    rect(ctx, '#fff8e9', x + 9, y + 4, w - 18, 6);
    rect(ctx, '#5f7e78', x + 2, y + h - 2, w - 4, 3);
  }
  if (type === 'sofa') {
    rect(ctx, '#5d536d', x + 2, y - 4, w - 4, 19);
    rect(ctx, '#9d83ad', x + 4, y - 3, w - 8, 10);
    rect(ctx, '#bba2c4', x + 6, y + 6, w - 12, 6);
    rect(ctx, '#796588', x + 3, y + 5, 4, 8);
    rect(ctx, '#796588', x + w - 7, y + 5, 4, 8);
    rect(ctx, '#e2bc88', x + 9, y + 1, 8, 6);
    rect(ctx, '#e8c9d4', x + w - 17, y + 1, 8, 6);
  }
  if (type === 'coffee') {
    rect(ctx, '#6a6251', x + 1, y, w - 2, h - 1);
    rect(ctx, '#b7a282', x + 2, y + 6, w - 4, 8);
    rect(ctx, '#d7c1a1', x + 2, y, w - 4, 6);
    rect(ctx, '#435454', x + 7, y - 10, 15, 14);
    rect(ctx, '#738a84', x + 8, y - 9, 13, 4);
    rect(ctx, '#e2b276', x + 18, y - 8, 2, 2);
    rect(ctx, '#f7ead7', x + 12, y, 6, 4);
    rect(ctx, '#6b9479', x + 32, y - 1, 6, 5);
  }
}

export function createBackground(employees) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  rect(ctx, '#d3e0d2', 0, 0, WIDTH, HEIGHT);
  rect(ctx, '#bfcfc1', 0, 117, WIDTH, 51);
  for (let x = 0; x < WIDTH; x += 16) {
    rect(ctx, '#a9bfb0', x, 128, 1, 32);
    rect(ctx, '#d4e0cb', x + 3, 141, 5, 2);
  }
  rug(ctx, 34, 137, 399, 12, '#abbe9e', '#8fa785');
  rug(ctx, 449, 129, 24, 29, '#d8aa75', '#ad8262');
  rooms.forEach(room => drawRoom(ctx, room));
  rug(ctx, 154, 119, 178, 67, '#c2b98e', '#9a9e77');
  rug(ctx, 24, 166, 64, 49, '#c3afce', '#aa92b6');
  rug(ctx, 392, 166, 64, 49, '#c3afce', '#aa92b6');
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const left = x * TILE;
      const top = y * TILE;
      if (isWall([x, y])) {
        rect(ctx, '#4c6a62', left, top, 16, 16);
        rect(ctx, '#63877b', left + 1, top + 2, 15, 9);
        rect(ctx, '#7c9d8e', left + 1, top + 2, 15, 2);
        rect(ctx, '#3f5c56', left, top + 13, 16, 3);
      } else if (isDoor([x, y])) {
        rect(ctx, '#d6b68e', left, top + 3, 16, 10);
        rect(ctx, '#a98864', left, top + 4, 16, 1);
        rect(ctx, '#f4d7aa', left, top + 11, 16, 1);
      }
    }
  }
  for (const x of [92, 164, 236, 308, 380]) windowSprite(ctx, x, 17, 46);
  for (const employee of employees) {
    for (const [x, y] of [employee.desk, employee.meeting]) {
      chair(ctx, x * TILE + 8, y * TILE + 10, employee.light);
    }
  }
  furniture.forEach(item => drawFurniture(ctx, item));
  return canvas;
}

export function drawPerson(ctx, person, x, y, activity = 'standing', facing = 'south', time = 0) {
  const walking = activity === 'walking';
  const seated = ['working', 'meeting', 'resting'].includes(activity);
  const step = walking ? Math.floor(time / 105) % 2 : 0;
  const talking = activity === 'meeting' && Math.floor(time / 300) % 5 === 0;
  const typing = activity === 'working' && Math.floor(time / 145) % 2;
  const sipping = activity === 'coffee' && Math.floor(time / 550) % 3 !== 0;
  const head = y - (seated ? 23 : 28) + step;
  const back = facing === 'north';
  const shift = facing === 'east' ? 2 : facing === 'west' ? -2 : 0;
  const side = shift !== 0;
  rect(ctx, '#243e3b38', x - 8, y - 1, 16, 3);
  rect(ctx, '#39404c', x - 6, y - 6 + step, 5, 6 - step);
  rect(ctx, '#39404c', x + 1, y - 6 - step, 5, 6 + step);
  rect(ctx, '#252e3a', x - 7, y - 2 + step, 6, 2);
  rect(ctx, '#252e3a', x + 1, y - 2 - step, 6, 2);
  rect(ctx, ink, x - 7, head + 14, 14, y - head - 17);
  rect(ctx, person.suit, x - 6, head + 15, 12, y - head - 19);
  rect(ctx, person.light, x - 4, head + 15, 8, 2);
  if (person.variant === 'doctor' && !back) rect(ctx, '#60998e', x - 1, head + 16, 2, 4);
  rect(ctx, person.skin, x - 8, head + 17 + (typing || step ? -1 : 1), 3, 4);
  rect(ctx, person.skin, x + 5, head + (sipping ? 13 : 17) + (typing || step ? 1 : 0), 3, 4);
  rect(ctx, person.hair, x - 8, head + 3, 16, 12);
  rect(ctx, person.hair, x - 6, head + 1, 12, 3);
  rect(ctx, person.light, x - 5, head + 2, 7, 1);
  if (!back) {
    rect(ctx, person.skin, x - 6 + shift, head + 6, side ? 10 : 12, 7);
    rect(ctx, person.skin, x - 4 + shift, head + 13, side ? 6 : 8, 2);
    rect(ctx, person.hair, x - 6, head + 5, person.variant === 'curl' ? 10 : 7, 2);
    if (person.variant === 'bob' || person.variant === 'clip') rect(ctx, person.hair, x - 8, head + 8, 3, 8);
    if (person.variant === 'curl') rect(ctx, person.hair, x + 5, head + 3, 4, 5);
    if (person.variant === 'clip') rect(ctx, '#f0ce76', x + 3, head + 5, 4, 2);
    if (person.variant === 'glasses') {
      rect(ctx, '#374452', x - 5 + shift, head + 8, side ? 5 : 10, 3);
      rect(ctx, '#a6c8d0', x - 4 + shift, head + 9, 2, 1);
      if (!side) rect(ctx, '#a6c8d0', x + 2, head + 9, 2, 1);
    } else {
      rect(ctx, '#382d37', x - 3 + shift, head + 9, 1, 2);
      if (!side) rect(ctx, '#382d37', x + 3, head + 9, 1, 2);
    }
    rect(ctx, '#a85855', x + shift, head + 12, activity === 'resting' ? 3 : 2, talking ? 2 : 1);
  }
  if (sipping) {
    rect(ctx, '#fff6dc', x + 6, head + 12, 5, 4);
    rect(ctx, '#a86f59', x + 6, head + 12, 5, 1);
  }
  if (talking) {
    rect(ctx, '#fff7df', x - 4, head - 8, 9, 5);
    rect(ctx, '#7b8e7d', x - 2, head - 6, 5, 1);
    rect(ctx, '#fff7df', x - 1, head - 3, 2, 2);
  }
}

export function actorAnchor(actor) {
  const [x, y] = actorPosition(actor);
  const activity = actorStatus(actor);
  return [x * TILE + 8, y * TILE + (activity === 'working' ? 8 : 12)];
}

export function drawOffice(ctx, background, actors, time) {
  ctx.drawImage(background, 0, 0);
  const sorted = actors.map(actor => ({ actor, anchor: actorAnchor(actor) }))
    .sort((a, b) => a.anchor[1] - b.anchor[1]);
  for (const { actor, anchor } of sorted) {
    const activity = actorStatus(actor);
    drawPerson(ctx, actor.employee, ...anchor, activity, activity === 'working' ? 'east' : actor.facing, time + actor.employee.desk[0] * 70);
  }
  return sorted;
}

export function drawPortrait(canvas, employee) {
  const ctx = canvas.getContext('2d');
  rect(ctx, '#e4ede5', 0, 0, canvas.width, canvas.height);
  drawPerson(ctx, employee, 16, 32);
}
