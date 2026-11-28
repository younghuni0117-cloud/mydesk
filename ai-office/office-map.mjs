export const TILE = 16;
export const COLS = 30;
export const ROWS = 18;
export const WIDTH = COLS * TILE;
export const HEIGHT = ROWS * TILE;

export const rooms = [
  { name: '공동 업무 · 회의 공간', x: 1, y: 1, w: 28, h: 16, floor: 'honey' },
];

export const furniture = [
  { type: 'desk', x: 5, y: 5, w: 3, h: 1, accent: '#3e8c86' },
  { type: 'desk', x: 13, y: 5, w: 3, h: 1, accent: '#6ea69d' },
  { type: 'desk', x: 21, y: 5, w: 3, h: 1, accent: '#c76b59' },
  { type: 'desk', x: 8, y: 13, w: 3, h: 1, accent: '#6589b0' },
  { type: 'desk', x: 19, y: 13, w: 3, h: 1, accent: '#8e6bb5' },
  { type: 'table', x: 11, y: 9, w: 8, h: 1 },
  { type: 'shelf', x: 2, y: 2, w: 2, h: 1 },
  { type: 'shelf', x: 26, y: 2, w: 2, h: 1 },
  { type: 'plant', x: 2, y: 5, w: 1, h: 1 },
  { type: 'plant', x: 27, y: 5, w: 1, h: 1 },
  { type: 'plant', x: 2, y: 15, w: 1, h: 1 },
  { type: 'plant', x: 27, y: 15, w: 1, h: 1 },
  { type: 'sofa', x: 2, y: 11, w: 3, h: 1 },
  { type: 'sofa', x: 25, y: 11, w: 3, h: 1 },
];

const walls = new Set();
export const tileKey = ([x, y]) => y * COLS + x;
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    const edge = x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1;
    const entry = x === 29 && (y === 8 || y === 9);
    if (edge && !entry) walls.add(tileKey([x, y]));
  }
}
const blocked = new Set(walls);
for (const item of furniture) {
  for (let y = item.y; y < item.y + item.h; y++) {
    for (let x = item.x; x < item.x + item.w; x++) blocked.add(tileKey([x, y]));
  }
}
export const isWall = point => walls.has(tileKey(point));
export const isDoor = () => false;
export function isWalkable([x, y]) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS && !blocked.has(tileKey([x, y]));
}

export const employees = [
  { id: 'chief', name: '한유진', role: 'AI 비서실장', style: '차분하게 우선순위를 정리해요.', duties: '업무 분배, 일정 관리, 회의 조율, 대표 보고', hair: '#302438', suit: '#397e6a', light: '#65aa8f', skin: '#f0ae84', variant: 'bob', desk: [6, 6], meeting: [12, 8], rest: [2, 12] },
  { id: 'doctor', name: '서하늘', role: 'AI 주치의', style: '꼼꼼하고 이해하기 쉽게 설명해요.', duties: '건강검진 결과 설명과 건강 정보 상담', hair: '#443143', suit: '#e9f4f1', light: '#fffaf3', skin: '#efb38d', variant: 'doctor', desk: [14, 6], meeting: [15, 8], rest: [3, 12] },
  { id: 'advisor', name: '정다온', role: '회사 업무 상담가', style: '먼저 듣고 여러 선택지를 함께 살펴봐요.', duties: '조직 내 갈등, 업무 전략, 우선순위 상담', hair: '#6a3c36', suit: '#c2674f', light: '#e89d6b', skin: '#edaa79', variant: 'curl', desk: [22, 6], meeting: [18, 8], rest: [25, 12] },
  { id: 'simulation', name: '강이든', role: 'Simulation 기술 전문가', style: '검토 근거와 적용 조건을 짚어줘요.', duties: '구조·충돌·진동 Simulation, CAE/FEM 기술 검토', hair: '#272e49', suit: '#497898', light: '#77acc4', skin: '#ca8c62', variant: 'glasses', desk: [9, 14], meeting: [13, 10], rest: [26, 12] },
  { id: 'hr', name: '윤나래', role: '인사·채용 전문가', style: '경험과 강점을 구체적인 사례로 정리해요.', duties: '이력서, 경력 개발, 채용공고, 면접 준비', hair: '#4b3259', suit: '#895f9d', light: '#b88bc4', skin: '#f2bf99', variant: 'clip', desk: [20, 14], meeting: [17, 10], rest: [27, 12] },
];
