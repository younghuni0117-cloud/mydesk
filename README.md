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

## GitHub에서 수정하기

이 저장소의 `main` 브랜치에서 홈페이지를 관리합니다. 파일을 열고 연필(Edit) 버튼으로 수정한 뒤 Commit changes를 누르세요.

- 글과 메뉴: `index.html`
- 색상과 화면 구성: `style.css`
- 강화학습과 게임 동작: `app.js`

## GitHub Pages 연결 (최초 한 번)

저장소 소유자가 https://github.com/younghuni0117-cloud/mydesk/settings/pages 에서 다음을 설정하세요.

1. Build and deployment → Source: **Deploy from a branch**
2. Branch: **main**, 폴더: **/ (root)**
3. **Save**

연결 후 GitHub Pages 배포가 완료되면 https://younghuni0117-cloud.github.io/mydesk/ 에서 홈페이지를 볼 수 있습니다. 이후 main 브랜치에 수정 내용을 커밋하면 자동으로 다시 배포됩니다. 배포 진행 상황은 저장소 Actions 탭에서 확인할 수 있습니다.

Pages 활성화는 현재 GitHub 연결의 관리자 권한 부족으로 자동 설정하지 못했습니다. 위 설정 전에는 GitHub Pages 주소가 열리지 않을 수 있습니다.

기존 Sites 사이트(https://curiosity-rl-lab-q7n4.younghuni0117.chatgpt.site)는 별도 배포이며, 이 저장소에서 수정한 내용은 그 주소에 자동 반영되지 않습니다.
