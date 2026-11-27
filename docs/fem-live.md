# FEM Live Lab 3D — 단계 1·2

## 현재 구현

상위 Simulation > FEM 시각화 (`fem-live.html`). 기존 학습정보 하위 Simulation은 보존한다. 기존 서버 메뉴는 클라이언트 호환 계층으로 새 항목만 추가하며 기존 메뉴/데이터를 변경하지 않는다.

작은 변형 3차원 등방 탄성, structured Hex8, 8 Gauss points. L=1m, W=H=0.12m, E=70GPa, ν=0.3. 기본 24×2×2=96요소, 225절점, 675변위 자유도. 변위/응력/반력 단위 m/Pa/N. X=0의 모든 병진을 고정하고 X=L의 UZ만 −δ로 지정한다. 끝단 UX/UY는 자유다. 기본 δ=5mm, 12 가력/12 복귀 증분. 복귀는 외력을 제거하는 것이 아니라 지정 변위를 0으로 돌린다.

실제 N/J/B/D/Ke/전역 K 조립, Dirichlet 분할, 부분 피벗 LU, Gauss 점 변형률/응력, von Mises, 주응력, 반력, 자유 자유도 잔차를 계산한다. 탄성 문제이므로 가짜 Newton 반복은 표시하지 않는다. Worker 계산과 UI 재생을 분리했다. 재생은 계산된 변위 상태를 순차 표시하며 재계산하지 않는다. 행렬 히트맵은 64보다 큰 전역행렬만 블록 최대 절댓값으로 요약 표시한다. 컨투어는 적분점에서 요소 평균으로 표시하고, 텐서는 선택한 적분점의 실제 값이다.

J2 radial return 재료 함수는 단위 검증만 완료했으며 UI 해석과 연결하지 않았다. 탄소성 기능이 구현되었다고 간주하면 안 된다.

## 검증 및 한계

`node --test --test-isolation=none tests/fem.test.mjs tests/navigation.test.mjs`

- Hex8 shape partition, volume, affine displacement patch.
- 요소 강성 대칭, 강체 병진 모드, 피벗 해법.
- 고정/지정변위 조건, 자유 DOF 평형, 전체 힘 평형, 양의 에너지, 탄성 복귀 후 영응력.
- 독립 Euler–Bernoulli 보 이론과 메시 수렴 비교: 4/12/24분할의 반력 오차 약 174.1%/23.4%/8.9%. 완전 적분 저차 요소의 전단 잠김과 3D 경계조건 효과가 있다. 24분할 해를 정확해로 주장하지 않는다.
- J2 소성 비압축성, 경화 항복면 복귀, 이전 상태 불변, 주응력.
- 메뉴 추가 멱등성 및 기존 중첩 메뉴 보존.

외부 FEM 솔버와 교차 검증, 실제 모바일/WebGL 상호작용 검증은 미완료다. 실기기에서 60 FPS를 보장하지 않는다. 대변형/접촉/좌굴/동역학은 다루지 않는다.

## 다음 단계

3. 요소 조립·경계조건·선형 풀이 내부 이벤트까지 재생 확장. 현재는 증분 상태 재생이다. 행렬 수치 직접 탐색, 응력 큐브/힘 벡터, 분할 패널 확장.
4. J2 재료 함수를 전역 Newton과 연결. 수치적 일관 접선(중앙차분)을 명시하고 검증. trial/commit 분리, 잔차와 증분 수렴, line search/cutback, 실패 증분 표시, 소성 상태 보존, 변위 복귀 시 잔류 응력/반력 검증. 탄성/소성 분리 표시.
5. 독립 해석기 대조, 시간/메모리/모바일 최적화 및 UI·기존 페이지 회귀 검증. 전체 명세 완료 판정은 이후에 한다.

## 변경 파일

새 파일: fem-core.mjs, fem-material.mjs, fem-solver.mjs, fem-worker.mjs, fem-view.mjs, fem-live.js, fem-live.css, fem-live.html, tests/fem.test.mjs, 본 문서.
통합 변경: navigation-data.mjs, site-navigation.mjs, shell.js, tests/navigation.test.mjs.
