# 마인드맵 편집기 — layout3

작업 화면은 전체 너비를 사용하며 모든 화면 크기에서 왼쪽 메뉴는 기본적으로 접힌 서랍이다. 상단에는 맵 선택, 새 맵, **이름 변경**, 맵 삭제가 있다. 이름 변경 버튼은 맵 삭제 바로 앞에 배치한다. 이름은 모달의 저장으로 확정하며 취소·Escape는 변경하지 않는다. 상세 글과 저장 버튼은 페이지 하단에 유지한다.

## 박스와 편집

- 한 줄 박스의 기본 높이는 58px에서 **38px**로 줄였다. 패딩은 7px/12px이며 내용이 여러 줄이면 필요한 높이만큼 늘어난다. 글을 숨기거나 자르지 않는다.
- 박스 글은 짙은 `#24384f`, 굵기 600으로 표시한다. 도구·상세 글의 대비도 높인다.
- 짧은 터치·클릭·박스 더블클릭은 편집을 시작하지 않는다. 박스 길게 누르기(550ms), 오른쪽 버튼 또는 Shift+F10으로 메뉴를 열고 **글 편집**을 선택한다. Enter는 메뉴를 열며 메뉴 버튼은 키보드 Enter로 실행할 수 있다. 편집 중에는 일반 텍스트 선택/붙여넣기 메뉴를 허용한다.
- 새 박스도 자동으로 키보드를 열지 않는다. 빈 공간 길게 누르기로 새 박스를 만들거나 선택 박스의 메뉴로 하위 박스를 만든다. 실제 빈 공간을 두 번 클릭하는 기존 추가 단축 동작도 유지한다.
- 선택 박스 오른쪽 손잡이를 끌거나 팝업의 **가로폭** 슬라이더로 100–600px 사이에서 너비를 조절한다. 기본 180px, 기존 데이터의 너비가 없으면 동일한 기본값이다. 너비는 박스별로 저장한다. 손잡이는 화면 줌과 반대로 스케일하여 확대·축소 후에도 터치 영역이 유지된다. 키보드 좌우 방향키로도 조절한다.

## 상위·하위 이동

기존 연결 배열 `[상위 id, 하위 id]`의 저장 순서를 사용한다. 상위 박스를 끌거나 방향키로 움직이면 모든 자손의 **시작 좌표에 동일한 이동량**을 더한다. 하위 박스를 끌면 그 박스와 자손만 움직이고 상위·형제·연결되지 않은 박스는 유지한다. 너비 변경은 다른 박스의 좌표를 옮기지 않는다. 연결선은 실제 박스 너비·높이에 맞춰 다시 그린다.

여러 상위에서 공유하는 하위 박스는 한 번만 이동한다. 기존 순환 연결은 삭제하거나 재구성하지 않고 방문 집합으로 무한 순회를 방지한다. 새 연결 메뉴는 선택 박스를 상위로 사용하며, 새 순환 관계를 만들려는 연결은 거절한다. 기존 연결 해제와 삭제/되돌리기는 유지한다.

팝업을 숨긴 직후 브라우저가 빈 화면에 보낸 합성 더블클릭으로 박스가 잘못 생기는 문제를 재현하고 수정했다. 실제 빈 공간에서 연속된 두 번의 포인터 탭을 확인해야 추가한다.

## 저장 보존

`mydesk.mindmap.v2` 컬렉션과 맵/박스 ID, 제목, 글, 상세 글, 색상, 연결, 좌표를 유지한다. 선택적 `node.width`만 추가하며 스키마 번호나 저장소 키를 바꾸지 않는다. v1 이관은 기존 방식대로 원래 `mydesk.mindmap.v1`을 수정하지 않고 복사한다. 잘못된 저장본은 덮어쓰지 않는다. 이름 변경은 제목만 바꾸며 다른 맵과 상세 글 초안을 유지한다.

위치·너비·박스 글·이름은 자동 저장한다. 하단 상세 글은 저장 버튼으로 확정하며 미저장 초안은 같은 탭의 선택/맵 전환 중 유지한다. 기기 간 공유 방식은 변경하지 않는다. 달력·로봇 및 다른 앱의 저장소는 수정하지 않는다.

HTML/controller에는 `layout3` 릴리스 표식을 추가했다. 이전 HTML과 새 컨트롤러가 섞이면 저장 데이터를 읽거나 쓰기 전에 같은 페이지의 캐시 회피 주소로 한 번 이동한다. 반복 이동 방지가 있으며 데이터 초기화는 사용하지 않는다.

## 검증

- `node --test tests/mindmap-layout.test.mjs`: 방향성 자손 이동, 공유 자손 중복 방지, 독립 노드 보존, 기존 순환 그래프 종료, 새 순환 감지, 기본/제한 너비.
- `NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules node scripts/verify-mindmap.cjs`: 실제 Chromium에서 38px 높이·글자 굵기, 클릭/더블클릭 시 편집 방지, 메뉴로만 편집, 키보드 메뉴/이름 변경, 마우스/터치 리사이즈, 줄바꿈과 연결선, 부모/자손 이동, 이름 변경 저장/취소, 재접속 후 너비·상세 글 복원, 여러 맵, 삭제 확인/되돌리기, 실제 두 손가락 확대, 다섯 화면 크기, 기존 저장본/다른 앱 보존, 이전 HTML 캐시 복구를 확인한다. 데이터 API는 합성 읽기 응답으로 대체하고 실제 사용자 맵은 읽지 않는다.

## Laptop viewport fit

The mindmap workspace uses the actual `100dvh` height with a fixed-size shared header and a min-height-zero flex/grid canvas, rather than a guessed viewport height plus overflowing detail content. Footer height is automatic; the preserved detail editor is a collapsed `<details>` panel that expands within a bounded scroll area. The canvas fills remaining space, and window/viewport resizing recomputes the view. No map data, node coordinates or connection credentials are changed.

`fitMapView` centers the complete rendered node bounds in the available canvas area, reserving actual bottom-toolbar height and padding. The previous 25% fit floor no longer cuts off large maps. Manual zoom now supports 1% to 300% for compatibility with fitted large maps. Bounds tests use laptop, wide desktop and portrait sizes. Connection/layout/sync tests: 12 pass. Actual notebook browser layout was not interactively tested in this environment.
