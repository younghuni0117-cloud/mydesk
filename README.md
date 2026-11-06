# mydesk

## 호기심 연구소 · Curiosity Lab

다양한 관심사를 직접 실험하는 개인 홈페이지입니다. 첫 번째 콘텐츠는 Q-learning으로 미로를 탐험하는 강화학습 게임입니다.

## 기능

- AI 학습과 직접 플레이
- 탐험 비율 및 학습 속도 조절
- 100회 빠른 학습, 학습 방향 표시, 보상 그래프
- 모바일 화면 및 방향키·화면 버튼 조작

## 실행

별도 설치나 빌드 없이 `index.html`을 브라우저에서 열면 됩니다. 로컬 서버로 실행하려면:

```sh
python3 -m http.server 8000
```

이후 http://localhost:8000 에 접속합니다.

## 파일

- `index.html`: 홈페이지 구조와 콘텐츠
- `style.css`: 반응형 디자인
- `app.js`: 게임 및 Q-learning 로직

외부 Google Fonts를 불러오며, 연결되지 않으면 기본 글꼴을 사용합니다. 학습 결과는 현재 브라우저 탭의 메모리에 유지되며 새로고침하면 초기화됩니다.

## 배포

현재 Sites 배포: https://curiosity-rl-lab-q7n4.younghuni0117.chatgpt.site

Sites 배포는 소유자 전용입니다. 이 GitHub 저장소는 홈페이지 소스를 보관하며, GitHub의 변경 사항이 Sites에 자동 배포되도록 연결되어 있지는 않습니다.
