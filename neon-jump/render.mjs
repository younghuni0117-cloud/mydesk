import { obstacleVertices, SIZE } from './physics.mjs?v=4';

const palettes = [
  ['#111636', '#2d3c88', '#8de9ff', '#619eff'],
  ['#191135', '#463080', '#adcbff', '#9a7aff'],
  ['#221032', '#58245d', '#ffb1ec', '#e66ed8']
];

export function render(canvas, level, state, effects = true, crashAge = 0, attempt = 0) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const [dark, light, edge, accent] = palettes[Math.max(0, ['first-jump', 'double-trouble', 'neon-rush'].indexOf(level.id))];
  const scale = Math.min(width / 555, height / 204);
  const view = width / scale;
  const floor = height * .79;
  const anchor = Math.min(140, view * .21);
  const camera = state.x - anchor;
  const gradient = ctx.createLinearGradient(0, 0, width * .25, floor);
  gradient.addColorStop(0, dark);
  gradient.addColorStop(1, light);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.scale(scale, scale);
  const horizon = floor / scale;
  const stride = 112;
  const first = Math.floor(camera * .34 / stride) - 1;
  const last = first + Math.ceil(view / stride) + 2;
  for (let tile = first; tile <= last; tile++) {
    const x = tile * stride - camera * .34;
    for (let row = 0; row < Math.ceil(horizon / 61); row++) {
      const inset = (tile + row) % 2 ? 13 : 5;
      const y = row * 61 - 9;
      ctx.fillStyle = '#07091b30';
      ctx.strokeStyle = '#8595ea36';
      ctx.lineWidth = 1;
      ctx.fillRect(x + inset, y, 100 - inset, 51);
      ctx.strokeRect(x + inset, y, 100 - inset, 51);
      ctx.strokeStyle = '#9daefe2d';
      ctx.beginPath();
      ctx.moveTo(x + inset + 6, y + 43);
      ctx.lineTo(x + inset + 18, y + 43);
      ctx.lineTo(x + inset + 23, y + 38);
      ctx.stroke();
    }
    if (effects) {
      ctx.fillStyle = '#c5ddff5e';
      ctx.fillRect(x + 32, 13 + ((tile * 31 % 89) + 89) % 89, 2, 2);
    }
  }
  ctx.restore();

  const ground = ctx.createLinearGradient(0, floor, 0, height);
  ground.addColorStop(0, '#232448');
  ground.addColorStop(1, '#090b22');
  ctx.fillStyle = ground;
  ctx.fillRect(0, floor, width, height - floor);
  ctx.save();
  ctx.translate(0, floor);
  ctx.scale(scale, -scale);
  ctx.fillStyle = '#5d73c934';
  for (let x = -(camera % 68) - 68; x < view; x += 68) {
    ctx.beginPath();
    ctx.moveTo(x, -7); ctx.lineTo(x + 60, -7); ctx.lineTo(x + 51, -24); ctx.lineTo(x - 9, -24);
    ctx.fill();
  }
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = edge;
  if (effects) { ctx.shadowColor = accent; ctx.shadowBlur = 11 * scale; }
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(view, 0); ctx.stroke();
  ctx.shadowBlur = 0;

  const finish = level.end - camera;
  if (finish < view && finish > -10) {
    ctx.fillStyle = '#75fce549';
    ctx.fillRect(finish, 0, 8, 120);
    ctx.strokeStyle = '#75fce5';
    ctx.strokeRect(finish, 0, 8, 120);
  }
  for (const obstacle of level.obstacles) {
    const { w, h, type } = obstacle;
    const x = obstacle.x - camera;
    if (x + w < 0 || x > view) continue;
    const fill = ctx.createLinearGradient(x, 0, x, h);
    fill.addColorStop(0, '#111332');
    fill.addColorStop(1, { spike: '#525b97', block: '#56468e', ramp: '#356e86', trapezoid: '#784357' }[type]);
    const outline = { spike: edge, block: '#c7a1ff', ramp: '#87f4dd', trapezoid: '#ffb4bb' }[type];
    ctx.beginPath();
    obstacleVertices(obstacle).forEach(([px, py], i) => {
      if (i === 0) ctx.moveTo(px - camera, py);
      else ctx.lineTo(px - camera, py);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = outline + (outline.length === 7 ? '70' : '');
    ctx.beginPath();
    if (type === 'spike') {
      ctx.moveTo(x + w * .32, h * .22); ctx.lineTo(x + w * .50, h * .62); ctx.lineTo(x + w * .68, h * .22);
    } else {
      for (let i = 1; i <= 2; i++) {
        const y = h * i / 4;
        ctx.moveTo(x + 4, y); ctx.lineTo(x + w - 4, y);
      }
      if (type === 'ramp') {
        ctx.moveTo(x + w * .31, h * .16); ctx.lineTo(x + w * .82, h * .71);
      } else {
        ctx.moveTo(x + w * .40, h * .65); ctx.lineTo(x + w * .60, h * .65);
        ctx.lineTo(x + w * .60, h * .82); ctx.lineTo(x + w * .40, h * .82);
        ctx.closePath();
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  const radius = SIZE / 2;
  const cy = Math.max(state.y + radius, radius * (Math.abs(Math.cos(state.angle)) + Math.abs(Math.sin(state.angle))));
  ctx.translate(anchor + radius, cy);
  if (state.status === 'crashed' && effects) {
    const t = Math.min(.72, crashAge);
    ctx.globalAlpha = 1 - t / .72;
    ctx.strokeStyle = edge;
    ctx.beginPath(); ctx.arc(0, 0, 8 + t * 115, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const direction = i * Math.PI / 6;
      ctx.fillStyle = i % 2 ? edge : accent;
      ctx.fillRect(Math.cos(direction) * t * 132, Math.sin(direction) * t * 118 - 50 * t * t, 3, 3);
    }
  } else {
    if (effects && state.tick > 0) {
      ctx.fillStyle = edge;
      for (let i = 0; i < 5; i++) {
        const phase = (state.tick * 2.7 + i * 8) % 40;
        ctx.globalAlpha = Math.max(0, 0.65 - phase / 62);
        ctx.fillRect(-radius - phase, -radius + 3 + Math.sin(i * 2 + phase * .1) * 3, 3, 3);
      }
      ctx.globalAlpha = 1;
    }
    // The physics square has the same silhouette at either rotation sign.
    ctx.rotate(-state.angle);
    if (effects) { ctx.shadowColor = edge; ctx.shadowBlur = 8 * scale; }
    const armor = ctx.createLinearGradient(-radius, 0, radius, 0);
    const armorEdge = state.status === 'crashed' ? '#f69abe' : edge;
    armor.addColorStop(0, armorEdge);
    armor.addColorStop(.48, '#49668f');
    armor.addColorStop(.52, '#49668f');
    armor.addColorStop(1, armorEdge);
    ctx.fillStyle = armor;
    ctx.fillRect(-radius, -radius, SIZE, SIZE);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#10122d';
    ctx.strokeRect(-radius + .7, -radius + .7, SIZE - 1.4, SIZE - 1.4);
    ctx.fillStyle = '#142240';
    ctx.beginPath();
    ctx.moveTo(-9, 0); ctx.lineTo(-6, 5); ctx.lineTo(6, 5); ctx.lineTo(9, 0);
    ctx.lineTo(6, -5); ctx.lineTo(-6, -5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e5fbff';
    ctx.fillRect(-5, -1.65, 3, 3.3);
    ctx.fillRect(2, -1.65, 3, 3.3);
    ctx.fillStyle = armorEdge;
    ctx.fillRect(-7, 7, 4, 1.5);
    ctx.fillRect(3, -8.5, 4, 1.5);
    ctx.fillStyle = '#172a4b';
    ctx.fillRect(-11, -8, 2, 5);
    ctx.fillRect(9, 3, 2, 5);
  }
  ctx.restore();

  ctx.fillStyle = '#eff8ff';
  ctx.font = '700 16px system-ui';
  ctx.fillText('점수 ' + (state.score ?? 0), 14, 27);

  if (attempt && state.tick < 85 && state.status === 'running') {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (85 - state.tick) / 24);
    ctx.fillStyle = '#eef5ff';
    ctx.font = '800 ' + Math.round(scale * 17) + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('시도 ' + attempt, width / 2, floor * .38);
    ctx.restore();
  }
}

export function drawChart(canvas, rows) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const left = 35, right = width - 8, top = 7, bottom = height - 17;
  if (right <= left || bottom <= top) return '';
  const values = rows.map(row => row.score);
  const low = Math.min(0, ...values);
  const high = Math.max(10, ...values);
  const y = value => bottom - (bottom - top) * (value - low) / (high - low);
  ctx.strokeStyle = '#dce2ed';
  ctx.fillStyle = '#435a71';
  ctx.font = '10px system-ui';
  ctx.beginPath();
  for (const mark of [low, (low + high) / 2, high]) {
    ctx.moveTo(left, y(mark)); ctx.lineTo(right, y(mark));
    ctx.fillText(Math.round(mark) + '점', 2, y(mark) + 3);
  }
  ctx.stroke();
  if (!rows.length) return '아직 완료된 학습 기록이 없습니다.';
  ctx.fillText(rows[0].episode + '회', left, height - 3);
  if (rows.length > 1) {
    ctx.textAlign = 'right';
    ctx.fillText(rows.at(-1).episode + '회', right, height - 3);
    ctx.textAlign = 'left';
  }
  for (const [key, color] of [['score', '#245683']]) {
    ctx.strokeStyle = ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    rows.forEach((row, i) => {
      const x = left + (right - left) * i / Math.max(1, rows.length - 1);
      if (i === 0) { ctx.moveTo(x, y(row[key])); ctx.fillRect(x - 1.5, y(row[key]) - 1.5, 3, 3); }
      else ctx.lineTo(x, y(row[key]));
    });
    ctx.stroke();
  }
  const last = rows.at(-1);
  return '에피소드 누적 상벌점 · 최근 ' + last.score.toFixed(1) + '점';
}
