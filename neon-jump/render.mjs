import { SIZE } from './physics.mjs';

export function render(canvas, level, state, effects = true, crashAge = 0) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const narrow = canvas.clientWidth < 500;
  const view = narrow ? 640 : 960;
  const scale = width / view;
  const floor = height - 67;
  const anchor = narrow ? 116 : 160;
  const camera = state.x - anchor;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#100b23');
  gradient.addColorStop(1, level.background);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#a38ef128';
  ctx.beginPath();
  for (let i = -((camera * 0.32 * scale) % 55); i < width; i += 55) { ctx.moveTo(i, 0); ctx.lineTo(i, floor); }
  for (let i = floor; i > 0; i -= 44) { ctx.moveTo(0, i); ctx.lineTo(width, i); }
  ctx.stroke();
  ctx.fillStyle = '#110a26';
  ctx.fillRect(0, floor, width, height - floor);
  ctx.strokeStyle = '#8a79f5';
  ctx.beginPath();
  ctx.moveTo(0, floor);
  ctx.lineTo(width, floor);
  ctx.stroke();

  ctx.save();
  ctx.translate(0, floor);
  ctx.scale(scale, -scale);
  const finish = level.end - camera;
  if (finish < view && finish > 0) {
    ctx.fillStyle = '#75fce549';
    ctx.fillRect(finish, 0, 8, 150);
    ctx.strokeStyle = '#75fce5';
    ctx.strokeRect(finish, 0, 8, 150);
  }
  for (const obstacle of level.obstacles) {
    const { w, h, type } = obstacle;
    const x = obstacle.x - camera;
    if (x + w < 0 || x > view) continue;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w, 0);
    if (type === 'spike') ctx.lineTo(x + w / 2, h);
    else { ctx.lineTo(x + w, h); ctx.lineTo(x, h); }
    ctx.closePath();
    ctx.fillStyle = type === 'spike' ? '#f15ebd' : '#7161e2';
    ctx.strokeStyle = type === 'spike' ? '#ffb6e8' : '#b8abff';
    ctx.fill();
    ctx.stroke();
  }

  const radius = SIZE / 2;
  const cy = Math.max(state.y + radius, radius * (Math.abs(Math.cos(state.angle)) + Math.abs(Math.sin(state.angle))));
  ctx.translate(anchor + radius, cy);
  if (state.status === 'crashed' && effects) {
    const t = Math.min(0.8, crashAge);
    ctx.globalAlpha = 1 - t / 0.8;
    for (let i = 0; i < 12; i++) {
      const direction = i * Math.PI / 6;
      ctx.fillStyle = i % 2 ? '#72f9fa' : '#f064cb';
      ctx.fillRect(Math.cos(direction) * t * 132, Math.sin(direction) * t * 118 - 50 * t * t, 4, 4);
    }
  } else {
    ctx.rotate(state.angle);
    if (effects) { ctx.shadowColor = '#72f9fa'; ctx.shadowBlur = 16; }
    ctx.fillStyle = state.status === 'crashed' ? '#f15ebd' : '#72f9fa';
    ctx.fillRect(-radius, -radius, SIZE, SIZE);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#194466';
    ctx.fillRect(-6, -6, 12, 12);
  }
  ctx.restore();
}

export const chartMetrics = {
  best: ['최고 진행률', '#7d42de'], average: ['최근 20회 평균 진행률', '#356bd5'],
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
  const values = rows.map(row => key === 'qJump' ? row.q[1] : key === 'qWait' ? row.q[0] : row[key]);
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return '아직 완료된 학습 기록이 없습니다.';
  const positive = ['best', 'average', 'epsilon'].includes(key);
  const bottom = positive ? 0 : Math.min(...valid);
  const top = positive ? 1 : Math.max(...valid);
  ctx.strokeStyle = '#dce2ed';
  ctx.beginPath();
  for (let i = 1; i < 5; i++) { ctx.moveTo(8, i * height / 5); ctx.lineTo(width - 8, i * height / 5); }
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  let started = false;
  values.forEach((value, i) => {
    if (!Number.isFinite(value)) { started = false; return; }
    const x = 8 + (width - 16) * i / Math.max(1, values.length - 1);
    const y = height - 12 - (height - 24) * (value - bottom) / (top - bottom || 1);
    if (!started) { ctx.moveTo(x, y); ctx.fillRect(x - 2, y - 2, 4, 4); }
    else ctx.lineTo(x, y);
    started = true;
  });
  ctx.stroke();
  return `${label} · ${rows[0].episode}–${rows.at(-1).episode}회 · 최근 ${valid.at(-1).toFixed(3)}`;
}
