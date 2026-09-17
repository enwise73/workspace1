// 영업일 게이트. 순수 함수 — DOM/fetch/Date.now()/localStorage를 직접 호출하지 않는다 (CLAUDE.md §4).
// 판정 기준 시각은 항상 인자로 받은 date이며, 러너·브라우저의 로컬 시간대와 무관하게
// Asia/Seoul 기준 날짜로 해석한다 (§6) — GitHub Actions 러너가 UTC로 돌기 때문에 이 부분을 깨면
// "한국은 이미 다음 날인데 미국 기준 어제로 판정" 같은 버그가 조용히 생긴다.

import { toKst } from './time.js';

const WEEKEND_REASON = { Sat: '토요일', Sun: '일요일' };

const OVERRIDE_MODE_BUSINESS = {
  WORK: true,
  REMOTE: true,
  VACATION: false,
};

const OVERRIDE_MODE_REASON = {
  WORK: '수동 지정: 특별근무',
  REMOTE: '수동 지정: 재택근무',
  VACATION: '수동 지정: 휴가',
};

/**
 * 영업일 여부를 판정한다. 우선순위(§5): 수동 지정 > 토·일요일 > 공휴일 > 그 외(영업일).
 * @param {Date} date 판정 기준 시각
 * @param {string[]} holidays "YYYY-MM-DD" 형식 공휴일 목록 (대체·임시공휴일 포함, 이미 정규화된 상태)
 * @param {{date: string, mode: 'WORK'|'REMOTE'|'VACATION'}[]} overrides 사용자 수동 지정 목록
 * @returns {{business: boolean, mode: 'WORK'|'REMOTE'|'VACATION'|'WEEKEND'|'HOLIDAY', reason: string}}
 */
export function isBusinessDay(date, holidays = [], overrides = []) {
  const { dateKey, weekday } = toKst(date);

  const override = overrides.find((item) => item.date === dateKey);
  if (override) {
    const business = OVERRIDE_MODE_BUSINESS[override.mode] ?? false;
    const reason = OVERRIDE_MODE_REASON[override.mode] ?? `수동 지정: ${override.mode}`;
    return { business, mode: override.mode, reason };
  }

  if (weekday in WEEKEND_REASON) {
    return { business: false, mode: 'WEEKEND', reason: WEEKEND_REASON[weekday] };
  }

  if (holidays.includes(dateKey)) {
    return { business: false, mode: 'HOLIDAY', reason: '공휴일' };
  }

  return { business: true, mode: 'WORK', reason: '평일' };
}
