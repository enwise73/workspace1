// Asia/Seoul 기준 날짜·시각 계산을 한 곳에 모은다.
// businessday.js와 planner.js가 같이 쓴다 — 계산 로직을 이중으로 만들지 않는다 (CLAUDE.md §2 A7).
// 순수 함수만 둔다. DOM/fetch/Date.now()를 직접 호출하지 않는다.

const KST_TIME_ZONE = 'Asia/Seoul';

const KST_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: KST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Date -> Asia/Seoul 기준 날짜/요일/자정 기준 분.
 * 러너·브라우저의 로컬 타임존과 무관하게 항상 같은 값을 준다 (§6).
 * @param {Date} date
 * @returns {{dateKey: string, weekday: string, minutesSinceMidnight: number}}
 */
export function toKst(date) {
  const parts = Object.fromEntries(KST_PARTS_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]));
  // hour12:false에서 자정을 "24"로 주는 환경이 있어 24 -> 0으로 보정한다.
  const hour = Number(parts.hour) % 24;
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday, // 'Mon' ~ 'Sun'
    minutesSinceMidnight: hour * 60 + Number(parts.minute),
  };
}

/**
 * "HH:MM" -> 자정 기준 분. 막차가 자정을 넘기는 "24:30" 표기도 그대로 받는다 (§6).
 * @param {string} text
 * @returns {number}
 */
export function parseHHMM(text) {
  const [hour, minute] = text.split(':').map(Number);
  return hour * 60 + minute;
}

/**
 * 자정 기준 분 -> "HH:MM". 24시를 넘는 값은 실제 시계 표시(0~23시)로 감아준다.
 * @param {number} minutes
 * @returns {string}
 */
export function formatHHMM(minutes) {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const WEEKDAY_KO = { Sun: '일', Mon: '월', Tue: '화', Wed: '수', Thu: '목', Fri: '금', Sat: '토' };

/**
 * 화면·텔레그램 메시지에 같이 쓰는 "9월 17일 (수)" 형태의 날짜 표시.
 * @param {Date} date
 * @returns {{dateKey: string, month: number, day: number, weekdayKo: string, text: string}}
 */
export function toDateLabel(date) {
  const { dateKey, weekday } = toKst(date);
  const [, monthStr, dayStr] = dateKey.split('-');
  const month = Number(monthStr);
  const day = Number(dayStr);
  const weekdayKo = WEEKDAY_KO[weekday] ?? weekday;
  return { dateKey, month, day, weekdayKo, text: `${month}월 ${day}일 (${weekdayKo})` };
}
