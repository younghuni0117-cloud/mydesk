# 맛집 기록

`restaurants.html`은 기존 달력 아래의 독립 메뉴다. 지도 경계는 저장소에 포함되어 외부 지도 타일 없이 표시되며, 기록은 기존 Supabase 프로젝트의 별도 `restaurant_records` 테이블에 저장된다. `sync/restaurant-records.sql`이 테이블·권한·메뉴판 버킷 정의다. 초기 두 식당은 운영 DB에 한 번만 추가했으며 페이지를 열 때 초기화하거나 재등록하지 않는다.

새 기록은 공개 등록할 수 있다. 수정·삭제는 기존 글·메뉴 관리 연결을 사용하며, 기존 관리 비밀번호·권한 구현을 변경하지 않았다. 수정은 읽었던 `revision`과 일치할 때만 저장한다. 새 기록 재시도는 동일 ID·동일 내용인지 확인하고 기존 내용을 덮어쓰지 않는다. 서버 연결 실패 시 입력을 유지하고 저장 성공으로 표시하지 않는다. 목록 캐시는 오프라인 조회 보조용이며 서버 데이터를 대체하거나 자동 업로드하지 않는다.

메뉴판은 `restaurant-menus` 공개 Storage 버킷에 별도 저장한다. 최대 6장, 한 장 8MB, JPEG/PNG/WebP만 허용한다. 작은 파일은 그대로 저장하며 2MB 초과 사진은 최대 긴 변 2400px JPEG로 처리한다. 공개 업로드는 새 UUID 파일만 만들 수 있고 기존 사진 교체·삭제 권한은 없다. 기록에서 첨부를 제거해도 Storage 원본은 보존되며, 물리 정리는 서버 관리 작업으로 분리한다. 업로드 실패 후 재시도에서는 이미 업로드한 경로를 재사용한다.

주소 검색은 사용자가 버튼을 누른 경우에만 Nominatim에 요청한다(자동완성 없음, 연속 요청 제한). 도로 중심점이 반환될 수 있어 결과를 선택하고 위치를 확인하도록 안내한다. 검색 실패 시 지도 직접 선택 또는 좌표 입력으로 등록할 수 있다. 실제 길찾기는 네이버 지도 링크로 연다.

## 지도와 초기 정보 출처

- 지도: [southkorea-maps KOSTAT 2013 단순화 시도 경계](https://github.com/southkorea/southkorea-maps/blob/master/kostat/2013/json/skorea_provinces_geo_simple.json). 해당 저장소 README는 KOSTAT 자료에 공유·수정 가능을 명시한다. 표시용 좌표를 소수점 두 자리 SVG 경로로 변환했으며 최신 행정경계 안내나 정밀 길찾기 용도가 아니다.
- 주소 검색: [OpenStreetMap/Nominatim](https://www.openstreetmap.org/copyright).
- 정원칼국수: [관광 안내](https://www.ktriptips.com/kor/food/2749005)의 의왕 능안길 146, 지도 좌표와 대표 메뉴. 동명 식당의 계원대학로 주소와 혼용하지 않았다.
- 화목칼국수 포천아트밸리점: [포천아트밸리 공식 주변 안내](https://artvalley.pcfac.or.kr/sub07/sub02.html?cate=Korean+food)의 아트밸리로 189-2 나동 1층. 위치는 주소 지도 기준이며 근사 위치임을 기록에 안내했다.
- 방문 후기·방문 날짜·메뉴판 사진·현재 가격은 임의 생성하지 않았다.

## 확인

`node --test tests/restaurant-data.test.mjs tests/navigation.test.mjs`

`NODE_PATH=… node scripts/verify-restaurants.cjs` (localhost:8004 미리보기 서버 필요)

브라우저 테스트는 별도 메모리 저장소로 등록·사진 실패/재시도·확대·관리 수정/삭제·화면 크기 4종을 확인한다. 운영 저장소의 실제 업로드·공개 이미지 조회·등록은 임시 ID로 별도 확인했고 임시 파일·행·검증 권한은 제거했다. 기존 블로그·달력·로봇 테이블은 변경하지 않는다.
