# 대한민국 공휴일 데이터

`korean-holidays.mjs`는 [@hyunbinseo/holidays-kr](https://github.com/hyunbinseo/holidays-kr)의 연도별 공휴일 JSON을 사이트에 함께 배포한 자료입니다. 외부 API 접속·사용자 API 키 없이 달력에 표시하며 가족 일정 테이블에는 공휴일을 등록하지 않습니다.

- 고정 원본: https://github.com/hyunbinseo/holidays-kr/tree/6479b938f3c1249be7d845926b300ffc33ffcb69/public
- 버전: 5.2027.2, 확인일: 2026-11-08 (한국 시간)
- 수록 연도: 2018~2027. 자료 없는 연도로 이동하면 안내를 표시하고 음력 명절·임시공휴일을 추측하지 않습니다.
- 라이선스: MIT, `KOREAN-HOLIDAYS-LICENSE.txt`에 원문과 저작권 표시 포함

공휴일은 우주항공청의 월력요항을 바탕으로 하며, 2026년부터 관공서 공휴일에 포함된 노동절·제헌절도 수록되어 있습니다. 2026/2027년 날짜·연휴·대체공휴일을 다음 1차 자료와 대조했습니다.

- [우주항공청 2027년 월력요항 발표](https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431)
- [관공서의 공휴일에 관한 규정 제2조, 2026-05-11 시행](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?lsJoLnkSeq=1033028571)
- [한국천문연구원 2027년 달력자료](https://astro.kasi.re.kr/kor/life/post/calendarData?year=2027)

공휴일 이름과 날짜는 화면 표시 전용이며 조회·등록·수정·삭제 API의 가족 일정과 분리됩니다. 앞으로 공휴일 자료나 화면을 업데이트할 때에도 기존 일정 ID, `calendar_id`, 공유 링크와 `mydesk.calendar.family` 키를 유지합니다.
