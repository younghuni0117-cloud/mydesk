# Cart-Pole Evolution Lab

The original cart-pole and its storage are independent. The rebuilt lab uses the
`mydesk.cartpole-evolution.v4.*` keys for training data. Previous results stay
under their original keys because link geometry and success criteria changed.

The rail constrains the 1 kg cart to translation. Planck rigid bodies use
uniform rectangular rods (width 0.022 m) with equal lengths of 0.65 m.
Successive masses are 0.12, 0.09, 0.07, 0.05 and
0.04 kg. Each rod's inertia about its center is
`mass * (length² + width²) / 12`. Passive revolute joints apply relative damping
of 0.001 N·m·s/rad. The only learned action is a bounded cart force of ±10 N.
Bodies share a 2D projection of separate hardware planes, so fixtures do not
self-collide. Four 5 ms physics steps are executed per 20 ms action.

Each level owns a separate 32-hidden-unit Actor-Critic policy. Inputs are
normalized cart position and velocity, plus sin, cos and scaled angular
velocity for each rod's absolute angle. The Worker gathers 1,536 or more
transitions from up to five worlds per PPO update. GAE is calculated with
separate streams and bootstraps time limits. The policy uses the existing MyDesk
tanh-Gaussian PPO implementation with clipped objective, entropy, value loss
and Adam. Episode duration is 25–60 simulation seconds, with a default of 30.

The deterministic evaluation uses eight fixed, near-down initial poses and
40 seconds per trial. All links must remain within ±10° of vertical for at least
20 consecutive seconds while the cart stays within ±2.4 m. Seven passes unlock
the next level. Automatic evaluation runs every five PPO updates and at the end
of a training batch. The latest completed policy, optimizer and metrics are
saved locally. Reload starts paused at a fresh rollout and does not carry over
unfinished physics episodes. Per-level reset retains one recoverable checkpoint.

Physical and integration tests:

```sh
node --test --test-isolation=none tests/cartpole-evolution.test.mjs
```

Under the previous 5-second hold criterion, Level 1
passed 8/8 fixed trials at update 750 with seed 8123 and at update 800 with seed
791 (sampled checkpoints). These runs started from randomized network weights
and near-down poses. Level 2 did not pass in the tested 1,000-update run. Series
lengths through Level 5 have validated numerical dynamics. Swing-up convergence
at higher levels remains unverified.

This GitHub Pages build uses browser-local storage and CPU execution.

Training runs independently of the view and stops after the requested number of
additional completed episodes. The last partial rollout is updated before saving.
The canvas runs a separate Planck world at normal speed, interpolating each
display frame between 20 ms policy steps. Training observation uses a frozen copy
of the newest completed policy at the beginning of each displayed episode.
Explicit model execution holds the selected snapshot and disables exploration.
The full rail stays fixed on screen. The model uses a fixed local drawing scale
in portrait and landscape.

### 관절 저항 상세 옵션

상세 옵션의 관절 마찰 토크(0–0.2 N·m, 기본 0.002)와 회전 댐핑(0–0.1 N·m·s/rad, 기본 0.005)은 모든 회전 관절에 공통 적용한다. 마찰은 Planck의 목표 상대속도 0인 토크 제한 브레이크이며 링크를 구동하는 정책 모터가 아니다. 댐핑은 상대각속도에 비례하는 반대 방향 토크를 양쪽 강체에 적용한다. 0이면 각 저항을 끈다. 기존 damping 생성자 옵션도 호환한다. 직접 물리 모델 생성 시 마찰은 기존처럼 0이며 앱 기본 설정은 약한 마찰 0.002다.

브라우저 설정 저장, 학습 환경·재생 환경·고정 평가에 연결했다. 학습 중 변경은 rollout 경계에서 적용하고 모델 미리보기는 즉시 적용한다. 정책 가중치는 초기화하지 않는다. 평가 결과는 설정한 저항 조건의 결과로 해석해야 한다.

검증: `node --test --test-isolation=none tests/cartpole-resistance.test.mjs tests/cartpole-evolution.test.mjs` — 19개 통과. 저항의 에너지 소산, 모든 관절의 브레이크 방향·한도, 범위 제한 및 0값, 정책 가중치 유지, 미리보기 설정 적용, 기존 물리/PPO/Worker 회귀 검증.

### 초기 자세: 아래로 늘어짐으로 통일

학습 환경(생성·에피소드 리셋·오류 복구), 확률적 학습 관찰, 결정론적 모델 실행, 고정 평가의 모든 시도는 링크가 아래로 늘어진 상태에서 시작한다. 이전의 기울임/직립 혼합 시작과 평가 후반부 직립 시작을 제거했다. 각 링크의 초기 절대각은 π±0.06rad이며 초기 속도는 0이다. 작은 각도 편차만 남겨 완전 대칭을 피한다. 기존 정책과 학습 기록은 유지한다.

검증: Cart-Pole 기존 테스트 및 관절 저항/초기 자세 테스트 20개 통과. 반복 리셋·학습 관찰·모델 실행·8회 고정 평가의 초기 자세를 확인했다.
