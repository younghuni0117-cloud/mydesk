# 가족 달력: 다중 대상과 기기별 확인

`sync/calendar-targets-activity.sql`을 서버에 적용한 뒤 calendar14 화면을 배포한다. 기존 일정 13건의 기존 열 전체와 등록·수정 시각은 확장 전후 동일한 해시로 확인했다. 기존 데이터에 UPDATE/DELETE나 일괄 재등록을 실행하지 않는다.

## 대상과 호환성

`targets`는 기존 개인 분류 키 `personal/school/medical/other`(영훈/서정/하경/하윤)의 배열이다. 이전 행은 targets가 null인 채 유지하며, 조회할 때 기존 category로 해석한다. family는 네 명 모두다. 화면에는 ‘모두’ 마스터 체크와 개별 체크를 제공하고 일부만 선택하면 ‘모두’는 체크·부분 선택 표시 없이 비워 둔다. 한 명 이상 선택해야 저장된다.

모두는 회색, 영훈은 파란색, 서정은 주황색, 하경은 보라색, 하윤은 핑크색이다. 두세 명은 선택된 사람의 연한 색을 배경 그라데이션으로 섞고, 네 명 모두면 회색으로 표시한다. 작은 대상 색상 막대는 표시하지 않는다. 필터는 대상 배열과의 교집합을 검사하므로 중복 일정이 생기지 않는다. 기존 category 열은 새 대상 배열에서 파생하여 유지한다. 이전 브라우저가 제목·시간만 저장해도 기존 다중 대상은 보존되고, 옛 category 자체를 변경하면 그 선택에 맞춰 대상을 갱신한다. 숨겨진 기존 person/location 값도 보존한다.

## 다가오는 일정

달력에 보이는 월과 별개로 오늘 이후 끝나는 일정 전체를 페이지 단위로 읽는다. 한국시간 기준 종료된 일정은 목록에서 제외하고 시작 일시 오름차순으로 보여준다. 종일 일정은 종료 날짜 다음 날 자정까지 유효하다. 오늘 시작할 일정은 ‘오늘’, 진행 중이면 ‘진행 중’, 미래 날짜는 D-n이다. 지난 일정은 삭제되지 않고 달력의 월·주·일·목록 보기에 남는다. 월 셀의 ‘더 보기’는 그 날짜의 일 보기로 전환해 숨겨진 지난 일정도 접근할 수 있다.

## 신규·수정 알림

기존 행의 `change_revision=0`을 알림 시작 전 기준으로 삼아 과거 일정 전체가 새 알림으로 쏟아지지 않게 한다. 이후 INSERT는 revision 1/new, 실제 일정 정보가 달라진 UPDATE는 revision 증가/updated로 기록한다. 이전 내용은 `previous_values`에 한 단계만 저장해 재귀적으로 커지지 않는다. 같은 내용 재저장은 변경 시각·버전·알림을 갱신하지 않는다. 서버 trigger는 SECURITY INVOKER이며, 기존 달력 RLS를 유지한다. 클라이언트는 변경 버전·시각·이전 값을 위조할 수 없도록 INSERT/UPDATE 열 권한을 일정 입력 필드에만 부여한다.

알림은 같은 일정의 최신 버전 한 건만 보여준다. 확인은 공유 서버를 변경하지 않고 해당 브라우저 localStorage의 `mydesk.calendar.confirmed.v1:<family>:<event>`에 버전과 마지막 확인 스냅샷을 기록한다. 따라서 다른 기기·브라우저에 영향을 주지 않고 재접속 후에도 유지된다. 같은 브라우저의 탭은 storage 이벤트로 표시를 갱신한다. 수정 알림은 신규 알림과 같은 구성으로 현재 일정만 표시하고, 주황색 ‘수정’ 배지로 구분한다. 변경 전후 상세는 화면에 표시하지 않는다. 기존 확인 스냅샷과 서버 이전 값은 그대로 보존한다. 확인 버튼을 누르는 사이 새 버전이 도착하더라도 보지 않은 새 버전을 확인 처리하지 않는다.

기존 행도 업데이트 이후 실제로 수정하면 ‘수정’으로 알린다. 새 브라우저는 기능 도입 이후 아직 확인하지 않은 신규·수정을 보여준다. 브라우저 저장소가 차단되거나 가득 차면 현재 화면의 확인 상태만 유지하고 재접속 시 다시 보일 수 있음을 안내한다. 브라우저 데이터 삭제 후에는 확인 정보도 사라진다. 확인해도 일정 자체는 삭제되지 않는다.

## 검증

- `node --test tests/calendar.test.mjs tests/calendar-activity.test.mjs tests/calendar-identity.test.mjs tests/calendar-holidays.test.mjs`
- `scripts/verify-calendar-activity.cjs`: 두 개의 격리 브라우저와 메모리 서버로 다중 체크, 미래 월 포함 정렬, 지난 일정 제외, D-day, 신규/수정·최신 한 건, 변경 상세 숨김, 서버에 확인 요청이 없는 점, 4개 화면 크기를 검증한다.
- `scripts/verify-calendar-activity-live.cjs`: 새로운 임시 달력에서 실제 저장·수정 버전·이전 값, 익명 메타데이터 위조 거절, 구형 category 수정 호환, 무변경 재저장, 다른 달력 격리를 확인한다. 자신이 만든 UUID만 삭제한다.
- 기존 `verify-calendar-views.cjs`·`verify-calendar-spans.cjs`: 월/주/일/목록, 연속 막대, 시각·종일 입력과 기존 데이터 보존을 확인한다.

운영 스키마 확장 및 임시 달력 검증 후 기존 일정의 건수·전체 기존 내용·시각 해시가 그대로인지 확인했다. 기존 블로그·메뉴·맛집·로봇 데이터와 관리자 비밀번호는 변경하지 않는다.

calendar15 화면은 신규·수정 알림을 일정별 주황색 박스로 구분한다. 공통 제목·건수와 일괄 확인 버튼은 제거하고 개별 확인만 제공한다. 일정 제목은 종전 알림 그룹 제목과 같은 글꼴·크기·굵기를 사용하며, 다가오는 일정의 행 간격은 조금 줄였다. 확인 저장 키·일정 데이터 구조는 바꾸지 않는다. `scripts/verify-calendar-style15.cjs`로 색상·그라데이션·개별 확인 유지·체크 동작과 4개 화면 크기를 검증한다.


## Calendar20: shared, editable holidays

- `sync/calendar-holiday-events.sql` extends the existing table with the `holiday` target and source/deletion fields. The original 16 schedules and all their original columns, timestamps and revisions were verified unchanged by fingerprint `ca0eb32a4086d77d6426438cdb048b9e` before/after migration and live tests.
- `calendar-holidays.mjs` imports the visible range and today through three calendar months later from the pinned Korean holiday catalogue (currently 2018–2027). No future dates are invented outside supported years. Calendar22 keeps that as the minimum cutoff, but extends it through the end date of the latest user-created future schedule, including manually created holidays. Automatically imported holidays never extend the cutoff. When the last distant schedule is removed or moved earlier, upcoming holidays return to the remaining schedule cutoff or the three-month minimum. Imports retain previous edits and deletion tombstones. Family schedules remain unrestricted.
- Import IDs are stable per calendar/date/name. Batched inserts use `resolution=ignore-duplicates`, preserving edits. Deleting an imported holiday marks its shared row hidden; later imports cannot resurrect it. Manual holidays use normal deletion. These hidden rows are excluded from calendar, upcoming and activity queries. No existing schedule is deleted by the migration or import.
- Holidays share the same existing calendar capability and RLS policies as family events. New and edited events are visible to all devices opening that same family calendar; only acknowledgment stays in each browser's existing local receipt storage. Open tabs poll every 20 seconds and refresh when brought back into view.
- `모두` remains the four relatives; `공휴일` is independent and red. Holiday event bars sort first, including ahead of multi-day family bars. Built-in duplicate holiday text labels are removed; all visible holiday bars open the normal editor and support add/edit/delete.
- New badges are orange; updated badges are blue. Regular calendar event text is dark gray; holiday text stays red.
- `tests/calendar-holiday-events.test.mjs`: cutoff/clamping, stable IDs, separate targets, holiday priority, duplicate/deletion protection, deletion requests.
- `scripts/verify-calendar-holiday-events.cjs`: synthetic shared calendar with import, edit, deletion across two browser profiles, manual CRUD, three-month window, mobile layout, badge colors, dark regular text and existing schedule preservation.
- `scripts/verify-calendar-holiday-live.cjs`: actual public REST calls in a fresh random test calendar; verifies CRUD, idempotent seed, preserved edits/deletions, capability isolation and timestamps; removes only test rows in finally.

Calendar22 checks upcoming shared schedules before importing holidays, so a newly opened device calculates the same extended window immediately. The browser regression verifies the three-month baseline, adding an April schedule, inclusion of March 1st, exclusion of May holidays, visibility on a second device, and returning to the baseline after deleting that April schedule.


## Calendar24: compact editor and fully expanded busy weeks

- The all-day checkbox and the four existing hour/minute selectors share one grid row, including 320px screens. All-day still disables time inputs without hiding them; 10-minute options and automatic end time one hour after the start are unchanged.
- Cancel/save are moved into a sticky header inside the same form. They remain reachable while a long note is scrolled. Existing close/Escape/delete/save and busy-state behavior is retained.
- The note starts at one 36px text line, grows with content and wrapping, shrinks after deletion, and measures existing content after opening. Only its visual height changes; all 2,000 permitted characters and newlines are retained.
- Month/week all-day bars are exactly 15px high with a 1px gap. Every month-week segment is rendered; the previous four-row cutoff and more-link are removed. Only the busy week grows based on its occupied lanes (32px date header + 16px per lane + bottom spacing). Other weeks keep their minimum height. Holiday priority and continuous multi-day segments are unchanged.
- `scripts/verify-calendar-editor24.cjs`: synthetic 14-schedule busy week versus a quiet week, no clipping or hidden rows, exact 15px bars, all-day disable/show behavior, one-line/growing/shrinking/preexisting notes, sticky top actions, real form submission and preserved values/original records across 320/390/768/1440px widths. All shared API writes are intercepted.
