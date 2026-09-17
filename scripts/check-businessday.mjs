// businessday.js 고정 입력 검증 (CLAUDE.md §10). 테스트 프레임워크 없이 node 내장 assert만 쓴다.
// 실행: node scripts/check-businessday.mjs
// UTC 확인: TZ=UTC node scripts/check-businessday.mjs  (결과가 동일해야 한다)

import assert from 'node:assert/strict';
import { isBusinessDay } from '../src/lib/businessday.js';

const holidays = ['2026-09-24', '2026-09-25', '2026-09-26']; // 추석 연휴 예시
const overrides = [
  { date: '2026-09-18', mode: 'VACATION' },
  { date: '2026-09-23', mode: 'REMOTE' },
  { date: '2026-09-24', mode: 'WORK' }, // 공휴일이지만 특별근무
];

let passed = 0;
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, `${label}\n  실제: ${JSON.stringify(actual)}\n  기대: ${JSON.stringify(expected)}`);
  passed += 1;
  console.log(`ok - ${label}`);
}

// 평일 07:30 정상 케이스 (2026-09-14 월요일, KST)
check(
  '평일은 영업일',
  isBusinessDay(new Date('2026-09-14T07:30:00+09:00'), holidays, overrides),
  { business: true, mode: 'WORK', reason: '평일' },
);

// 토요일 → 게이트 차단
check(
  '토요일은 비영업일',
  isBusinessDay(new Date('2026-09-12T07:30:00+09:00'), holidays, overrides),
  { business: false, mode: 'WEEKEND', reason: '토요일' },
);

// 공휴일 → 게이트 차단
check(
  '공휴일은 비영업일',
  isBusinessDay(new Date('2026-09-25T07:30:00+09:00'), holidays, overrides),
  { business: false, mode: 'HOLIDAY', reason: '공휴일' },
);

// 휴가 등록일 → 게이트 차단
check(
  '휴가 등록일은 비영업일',
  isBusinessDay(new Date('2026-09-18T07:30:00+09:00'), holidays, overrides),
  { business: false, mode: 'VACATION', reason: '수동 지정: 휴가' },
);

// 공휴일이지만 WORK 오버라이드 → 통과
check(
  'WORK 오버라이드는 공휴일도 영업일로 뒤집는다',
  isBusinessDay(new Date('2026-09-24T07:30:00+09:00'), holidays, overrides),
  { business: true, mode: 'WORK', reason: '수동 지정: 특별근무' },
);

// 재택 오버라이드 → 영업일이지만 mode는 REMOTE (교통 계산은 planner.js가 생략)
check(
  'REMOTE 오버라이드는 영업일이다',
  isBusinessDay(new Date('2026-09-23T07:30:00+09:00'), holidays, overrides),
  { business: true, mode: 'REMOTE', reason: '수동 지정: 재택근무' },
);

// UTC 환경에서 실행해도 KST 기준 결과가 동일해야 한다.
// 2026-09-13 15:30 UTC == 2026-09-14 00:30 KST(다음 날, 월요일) — 로컬 타임존에 의존했다면 여기서 틀어진다.
check(
  'UTC로 표현해도 KST 날짜로 판정한다',
  isBusinessDay(new Date('2026-09-13T15:30:00Z'), holidays, overrides),
  { business: true, mode: 'WORK', reason: '평일' },
);

console.log(`\n총 ${passed}건 통과`);
