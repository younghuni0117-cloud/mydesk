# mydesk

## 호기심 연구소 · Curiosity Lab

다양한 관심사를 직접 실험하는 개인 홈페이지입니다. Q-learning 미로 탐험과 CartPole 막대 균형 잡기 게임을 체험할 수 있습니다.

## 기능

- AI 학습과 직접 플레이
- 탐험 비율 및 학습 속도 조절
- 100회 빠른 학습, 학습 방향 표시, 보상 그래프
- 카트폴: 방향키·터치로 균형 잡기, AI 정책 탐색(CEM) 학습과 기록 비교
- 모바일 화면 및 방향키·화면 버튼 조작

## 실행

별도 설치나 빌드 없이 정적 웹 서버에서 실행합니다. 카트폴은 ES 모듈을 사용하므로 파일을 직접 열기보다 아래 명령을 사용하세요:

```sh
python3 -m http.server 8000
```

이후 http://localhost:8000 에 접속합니다.

## 파일

- `index.html`: 홈페이지 구조와 콘텐츠
- `style.css`: 반응형 디자인
- `app.js`: 미로 게임 및 Q-learning 로직
- `cartpole.js`: 카트폴 조작, 화면, 기록 저장
- `cartpole-core.mjs`: 카트폴 물리 시뮬레이션과 CEM 정책 학습
- `cartpole.css`: 카트폴 화면 스타일

외부 Google Fonts를 불러오며, 연결되지 않으면 기본 글꼴을 사용합니다. 미로 학습은 새로고침하면 초기화됩니다. 카트폴 학습과 직접 플레이 최고 기록은 브라우저 localStorage에 저장됩니다.

## GitHub에서 수정하기

이 저장소의 `main` 브랜치에서 홈페이지를 관리합니다. 파일을 열고 연필(Edit) 버튼으로 수정한 뒤 Commit changes를 누르세요.

- 글과 메뉴: `index.html`
- 색상과 화면 구성: `style.css`
- 미로 학습과 게임 동작: `app.js`
- 카트폴 물리·AI: `cartpole-core.mjs`, 조작·화면: `cartpole.js`

## GitHub Pages 연결 (최초 한 번)

저장소 소유자가 https://github.com/younghuni0117-cloud/mydesk/settings/pages 에서 다음을 설정하세요.

1. Build and deployment → Source: **Deploy from a branch**
2. Branch: **main**, 폴더: **/ (root)**
3. **Save**

연결 후 GitHub Pages 배포가 완료되면 https://younghuni0117-cloud.github.io/mydesk/ 에서 홈페이지를 볼 수 있습니다. 이후 main 브랜치에 수정 내용을 커밋하면 자동으로 다시 배포됩니다. 배포 진행 상황은 저장소 Actions 탭에서 확인할 수 있습니다.

GitHub Pages는 `main` 브랜치의 루트(`/`)에서 배포하도록 활성화되어 있습니다.

기존 Sites 사이트(https://curiosity-rl-lab-q7n4.younghuni0117.chatgpt.site)는 별도 배포이며, 이 저장소에서 수정한 내용은 그 주소에 자동 반영되지 않습니다.

## 카트폴 학습 방식

4개 상태(위치, 속도, 각도, 각속도)를 입력받아 좌우 힘을 고르는 선형 정책을 학습합니다. 각 세대에 현재 정책과 새 후보를 합쳐 25개 전략을 같은 3개 시작 조건에서 비교하고, 상위 6개의 가중치 분포로 다음 세대를 생성합니다(Cross-Entropy Method). 미리 훈련된 가중치나 정답 제어기는 사용하지 않습니다.

한 스텝은 0.02초이며, 실패하지 않은 스텝마다 보상 +1을 받습니다. 막대가 ±12°를 넘거나 카트가 ±2.4m를 벗어나면 종료하고, 1,000스텝(20초)을 버티면 성공합니다. 화면의 평가 그래프는 세대별 최우수 전략의 3회 평균으로, 임의의 시작 조건에서 항상 같은 성능을 보장하지는 않습니다.

검증: `node --test tests/cartpole.test.mjs`
