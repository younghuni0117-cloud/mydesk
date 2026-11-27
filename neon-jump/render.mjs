import { SIZE } from './physics.mjs';

const palettes = [
  ['#111636', '#2d3c88', '#8de9ff', '#619eff'],
  ['#191135', '#463080', '#adcbff', '#9a7aff'],
  ['#221032', '#58245d', '#ffb1ec', '#e66ed8']
];

export function render(canvas, level, state, effects = true, crashAge = 0, attempt = 0) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const [dark, light, edge, accent] = palettes[Math.max(0, ['first-jump', 'double-trouble', 'neon-rush'].indexOf(level.id))];
  const scale = Math.min(width / 430, height / 220);
  const view = width / scale;
  const floor = height * .79;
  const anchor = Math.min(140, view * .24);
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
    fill.addColorStop(1, type === 'spike' ? '#525b97' : '#56468e');
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w, 0);
    if (type === 'spike') ctx.lineTo(x + w / 2, h);
    else { ctx.lineTo(x + w, h); ctx.lineTo(x, h); }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = type === 'spike' ? edge : '#c7a1ff';
    ctx.stroke();
    ctx.strokeStyle = '#d6e6ff66';
    if (type === 'spike') {
      ctx.beginPath();
      ctx.moveTo(x + w * .32, h * .22); ctx.lineTo(x + w * .50, h * .62); ctx.lineTo(x + w * .68, h * .22);
      ctx.stroke();
    } else {
      ctx.strokeRect(x + 4, 4, w - 8, h - 8);
      ctx.fillStyle = '#ca9fff91';
      ctx.fillRect(x + 7, h - 9, w - 14, 2);
      ctx.fillRect(x + w * .42, h * .36, w * .16, 2);
    }
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
    ctx.fillStyle = state.status === 'crashed' ? '#f69abe' : edge;
    ctx.fillRect(-radius, -radius, SIZE, SIZE);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#141638';
    ctx.strokeRect(-radius + 1, -radius + 1, SIZE - 2, SIZE - 2);
    ctx.fillStyle = '#1c2550';
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-4, 4); ctx.lineTo(4, 4); ctx.lineTo(7, 0); ctx.lineTo(4, -4); ctx.lineTo(-4, -4); ctx.fill();
    ctx.fillStyle = '#d9f6ff';
    ctx.fillRect(-4, -1, 8, 2);
  }
  ctx.restore();

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

export const chartMetrics = {
  progress: ['최고 · 평균 진행률', '#245683'], best: ['최고 진행률', '#7d42de'], average: ['최근 20회 평균 진행률', '#356bd5'],
  score: ['회차별 누적 보상', '#6346aa'], loss: ['손실', '#b94386'],
  epsilon: ['탐색률', '#4365b2'], qJump: ['Q(점프)', '#7d42de'], qWait: ['Q(대기)', '#356bd5'],
  updates: ['가중치 갱신 횟수', '#4d5098'], hit: ['충돌 장애물 분포', '#b94386']
};

export function drawChart(canvas, rows, key) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const [label, color] = chartMetrics[key];
  if (key === 'hit') {
    const counts = new Map();
    for (const { hit } of rows) if (hit !== null) counts.set(hit + 1, (counts.get(hit + 1) ?? 0) + 1);
    const entries = [...counts].sort((a, b) => a[0] - b[0]);
    const peak = Math.max(1, ...counts.values()), gap = (width - 30) / Math.max(1, entries.length);
    ctx.fillStyle = color;
    ctx.font = '17px sans-serif';
    entries.forEach(([obstacle, count], i) => {
      const x = 15 + i * gap, h = count / peak * (height - 50);
      ctx.fillRect(x, height - 30 - h, gap * 0.65, h);
      ctx.fillText(String(obstacle), x, height - 7);
    });
    return entries.length ? entries.map(([i, n]) => `#${i} ${n}회`).join(' · ') : '충돌 기록이 없습니다.';
  }
  const series = key === 'progress'
    ? [[rows.map(row => row.best), '#245683'], [rows.map(row => row.average), '#9464cc']]
    : [[rows.map(row => key === 'qJump' ? row.q[1] : key === 'qWait' ? row.q[0] : row[key]), color]];
  const valid = series.flatMap(([values]) => values.filter(Number.isFinite));
  if (!valid.length) return '아직 완료된 학습 기록이 없습니다.';
  const positive = ['progress', 'best', 'average', 'epsilon'].includes(key);
  const bottom = positive ? 0 : Math.min(...valid);
  const top = positive ? 1 : Math.max(...valid);
  const y = value => height - 31 - (height - 48) * (value - bottom) / (top - bottom || 1);
  ctx.strokeStyle = '#dce2ed';
  ctx.fillStyle = '#435a71';
  ctx.font = '18px system-ui';
  ctx.beginPath();
  for (const mark of [bottom, (top + bottom) / 2, top]) {
    ctx.moveTo(64, y(mark)); ctx.lineTo(width - 12, y(mark));
    ctx.fillText(positive ? Math.round(mark * 100) + '%' : Number(mark.toPrecision(3)), 0, y(mark) + 5);
  }
  ctx.stroke();
  ctx.fillText(rows[0].episode + '회', 64, height - 5);
  if (rows.length > 1) {
    ctx.textAlign = 'right';
    ctx.fillText(rows.at(-1).episode + '회', width - 12, height - 5);
    ctx.textAlign = 'left';
  }
  for (const [values, line] of series) {
    ctx.strokeStyle = ctx.fillStyle = line;
    ctx.lineWidth = 3;
    ctx.beginPath();
    let started = false;
    values.forEach((value, i) => {
      if (!Number.isFinite(value)) { started = false; return; }
      const x = 64 + (width - 76) * i / Math.max(1, values.length - 1);
      if (!started) { ctx.moveTo(x, y(value)); ctx.fillRect(x - 2, y(value) - 2, 4, 4); }
      else ctx.lineTo(x, y(value));
      started = true;
    });
    ctx.stroke();
  }
  const last = rows.at(-1);
  return key === 'progress' ? '파랑 최고 ' + (last.best * 100).toFixed(1) + '% · 보라 평균 ' + (last.average * 100).toFixed(1) + '%'
    : label + ' · 최근 ' + valid.at(-1).toFixed(3);
}
