# PLAN.md — GoNow 진행 상황

> 작업을 이어갈 때 여기부터 읽는다. 완료 항목에 새로 알게 된 내용이 있으면 위 CLAUDE.md/PRD.md를 먼저 고치고, 이 파일은 "무엇을 언제 했는지/무엇이 남았는지"만 다룬다.

---

## 오늘까지 한 일 (~2026-09-13)

### 환경 준비
- GitHub CLI(`gh`), Cloudflare Wrangler CLI 로컬 설치 및 로그인
- Cloudflare 계정 workers.dev 서브도메인 등록(`enwise`)

### 문서
- CLAUDE.md를 Next.js 기준으로 전면 개정 (A1/A2 빌드도구·의존성 규칙, 기술스택, 파일구조, 코딩컨벤션)
- PRD.md §8·§14를 아래 "확정된 값"에 맞춰 갱신

### 프로젝트 스캐폴딩 & 화면
- Next.js(App Router, JavaScript, `output: 'export'`) 프로젝트 생성 — `next`/`react`/`react-dom`/`eslint`만 의존성
- 홈 화면(`/`), 설정 화면(`/settings`) — 처음엔 와이어프레임 그대로 하드코딩 → 이후 전부 실제 데이터 연결로 교체 완료(아래 참고)

### 배포/버전관리
- `git init` + 첫 커밋, GitHub 공개 저장소: **https://github.com/enwise73/workspace1**

### 사전조사 — 확정된 값
| 항목 | 값 |
| :---- | :---- |
| 목표 도착시각 | **08:20** |
| 도보시간 d1·d2·d3·d4 | **10분 · 5분 · 7분 · 5분** |
| 출근길 정류장 | 서울역 **6번 승강장**(정류소번호 **02006**) → **우리은행종로지점**(정류소번호 **02139**) |
| 출근길 버스 노선 | **103 · 173 · 202 · 261 · 262 · 7017 · 7021** |
| 퇴근길 | 교원빌딩 → 도보 5분 → **롯데백화점 본점**(정류소번호 **02140**) → 버스 → 서울역 (출근 역순 아님) |
| 퇴근길 버스 노선 | **100 · 103 · 162 · 173 · 201 · 261 · 262 · 500 · 501 · 502 · 506 · 7017 · 7021** |
| 퇴근길 하차 지점 | 노선마다 다름 — 숭례문 / 4번 승강장(**02004**) / 염천교 (노선별 정확한 ID는 미확인) |
| 기상청 격자좌표 | 운정 **nx55·ny130**, 명동 **nx60·ny127** |
| GTX-A 시간표 | 코레일톡 기준 141편 확보, `data/gtx-a.json`에 반영 (⚠️ 공식 출처 대조 권장) |
| 회사 영업일 / 재택근무 | 법정공휴일과 일치 / 재택 없음 |
| 저장소 | public (`workspace1`) |
| 브리핑 발송 시각 | **07:00** |
| API 키 4종 | 발급 완료, Cloudflare Workers Secret으로 등록 완료 |

### 계산 로직 4종 — 전부 작성 및 검증 완료
- `src/lib/time.js` — Asia/Seoul 날짜·분 계산 공용 유틸
- `src/lib/businessday.js` — 영업일 게이트 (`check-businessday.mjs` 7건 통과, TZ=UTC 동일)
- `src/lib/planner.js` — 역산 엔진 (`check-planner.mjs` 5건 통과). "출발 창(window)" 폭은 P6(텔레그램 알림) 설계 때 정하기로 미룸
- `src/lib/weather.js` — 우산/체감온도/옷차림/미세먼지 해석 (`check-weather.mjs` 14건 통과). 여름 체감온도는 NOAA 근사식(기상청 공식식과 다를 수 있음, `isApproximate`로 표시)
- `src/lib/sources.js` — 외부 API 어댑터 (`check-sources.mjs` 10건 통과 + **실제 API 응답으로 검증 완료**)

### Cloudflare Workers 프록시 — 배포 및 실제 연결 완료
- **https://gonow-proxy.enwise.workers.dev**
- 5개 엔드포인트(`/weather/now`, `/weather/forecast`, `/dust`, `/holidays`, `/bus/arrival`) 전부 실제 키로 200 OK 확인
- 시행착오 기록: 버스 API는 "서울 열린데이터광장" 키가 아니라 **공공데이터포털**의 "서울특별시_정류소정보조회 서비스"를 별도 활용신청해야 하는 키였음. 도착시간 필드도 `arrtime1/2`가 아니라 실제로는 `traTime1/2`. 지금은 `DATA_GO_KR_KEY` 하나로 4개 API 다 인증됨(`SEOUL_API_KEY`는 현재 미사용)

### 화면 ↔ 실제 데이터 연결 완료
- `src/lib/config.js` 신설 — localStorage 로드/저장 경계. 기본값은 전부 더미(§2 A4) — 정류장ID 등 실제 값은 설정 화면 입력 → localStorage에만 저장(저장소에 커밋 안 됨)
- 설정 화면 — 목표시각·d1~d4·정류장ID·버스노선·기상격자좌표·미세먼지 측정소·구간 이름(타임라인 표시용)·알림·예외일 전부 실제로 입력/저장 가능
- 홈 화면 — 실제로 공휴일·날씨·미세먼지·버스도착정보를 받아 `businessday.js`/`weather.js`/`planner.js`로 계산. "오늘 쉬기"/"오늘 근무로"/"그래도 교통정보 보기" 전부 실동작
- 라이브 파이프라인 종단 검증 완료 (공휴일→게이트→날씨→미세먼지→버스도착→역산까지 실제 값으로 확인). **사용자가 직접 설정 입력 후 홈 화면 정상 동작 확인 완료 (2026-09-17)**

### 사용자 실사용 확인 중 발견해 고친 버그 (2026-09-17)
- 설정 화면 "노선 번호" 입력칸에 콤마를 칠 수 없던 버그 — 입력값을 배열로 즉시 변환해 되먹이는 바람에 "103," 입력 직후 뒤 콤마가 잘려나갔음. 원문 텍스트를 별도 로컬 상태로 분리해 해결
- 기상청 단기예보 TMN(오늘 최저기온)이 **02시 발표에만** 실려있고 이후 발표엔 없다는 걸 실제 응답으로 확인 → 워커가 최신 발표 + 02시 발표를 같이 가져와 병합. `sources.js`도 `fcstDate`가 오늘인 값만 채택하도록 수정(내일 값이 섞이는 문제도 같이 해결)
- 설정 화면에 미세먼지 측정소 이름 입력칸이 아예 없어서 항상 "정보 없음" — 필드 추가
- 버스 도착정보에 노선번호가 없어 홈 화면에 "버스"라고만 뜨던 문제 — `normalizeBusArrival`이 `{route, minutes}`를 반환하도록 변경, planner.js 타임라인에 "버스 103번"처럼 표시
- 설정 화면에 구간 이름(출발역/노선명/도착역/승차·하차 정류장/목적지) 입력칸이 없어서 타임라인에 "방면", "→ 도보"처럼 빈 라벨이 뜨던 문제 — "구간 이름" 섹션 추가

---

## 다음에 할 일

### 미정 — 방향 결정 필요
- [ ] **퇴근 모드(F-30, v1.1)를 지금 만들지, 출근길부터 완전히 안정화한 뒤 나중에 할지** — 아직 안 정함

### 텔레그램 알림 — 코드는 완성, 사용자 설정 남음 (2026-09-17)
- [x] 텔레그램 봇 생성 완료 (BotFather), 토큰 로컬 보관 중
- [x] `scripts/telegram.mjs`, `scripts/config-env.mjs` — 전송·설정로드 공용 헬퍼
- [x] `scripts/sync-holidays.mjs` — 실행해서 `data/holidays.json` 이미 채움(46건, 2026~2027). 홈 화면도 매번 API 대신 이 캐시를 쓰도록 변경(§12 함정6)
- [x] `scripts/briefing.mjs` — 아침 브리핑 메시지 생성·전송, `buildMessage`는 부작용 없이 단독 호출 가능하게 분리해 실제 API로 미리보기 검증 완료
- [x] `scripts/reminder.mjs` — 출발 N분 전 리마인더. 상태 저장 없이 "폴링 간격만큼의 구간에 들어왔을 때만" 전송하는 방식 (워크플로 cron 간격과 `POLL_INTERVAL_MINUTES`가 반드시 일치해야 함)
- [x] `.github/workflows/{briefing,reminder,sync-holidays}.yml` — cron 등록, `workflow_dispatch` 수동 실행 지원. KST→UTC 환산 주석 포함(§6)
- [x] 설정 화면에 "설정 내보내기" 추가 — Actions는 브라우저 localStorage를 못 읽어서, 설정값 전체를 `GONOW_CONFIG`라는 GitHub Secret으로 등록하는 방식 채택(API 키와 동일한 취급, §2 A3/A4 정신 유지)
- [x] chat_id 확인, GitHub Secrets 3개(`GONOW_CONFIG`/`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`) 등록
- [x] 커밋했던 작업 전체를 실제로는 한 번도 GitHub에 푸시 안 했던 걸 발견 — 커밋·푸시 완료 (`6b937f8`)
- [x] **"영업일 아침 브리핑" 워크플로 수동 실행 → 텔레그램 메시지 수신 확인 완료 (2026-09-17)** — 알림 기능 종단 검증 끝
- [ ] "출발 리마인더", "공휴일 동기화" 워크플로도 한 번씩 수동 실행해서 확인 (아직 안 해봄)

### GitHub Pages 배포 완료 (2026-09-17)
- [x] `next.config.mjs`에 `basePath: '/workspace1'`, `trailingSlash: true` 적용
- [x] `public/.nojekyll` 추가 (없으면 GitHub Pages가 Jekyll로 처리해서 `_next` 정적 자산이 통째로 무시됨)
- [x] `.github/workflows/deploy.yml` — push 시 자동 빌드·배포, `workflow_dispatch` 수동 실행 지원
- [x] 저장소 Settings → Pages를 "GitHub Actions" 소스로 활성화
- [x] 삽질: `package.json`에 `engines`/`type` 추가 후 `package-lock.json`을 안 갱신해서 `npm ci`가 CI에서 실패 → 완전 재생성으로 해결
- [x] **실제 배포 확인: https://enwise73.github.io/workspace1/ (홈·설정 둘 다 200)**

### 2순위 — 자잘한 개선
- [ ] 설정 화면의 예외일 캘린더에서 월 이동(이전/다음 달) 지원 — 지금은 이번 달만 보임
- [ ] 퇴근길 — 롯데백화점본점 이후 노선별 하차 정류장ID 확정 (숭례문/4번승강장/염천교 중 노선별로 다름)

### 나중 (당장 안 막힘)
- [ ] 서울역~명동 도보 대체 가능 여부
- [ ] GTX 지연 시 대안 경로
- [ ] 옷차림 판정 기준 — 체감온도 vs 실제기온
