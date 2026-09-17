// 외부 API 호출 어댑터. 이 파일에서만 fetch를 한다 (CLAUDE.md §4) — 유일한 네트워크 경계다.
// 이상한 필드명·문자열 숫자·코드값은 여기서 전부 정규화해서 내보낸다. 원본 응답을 그대로
// 바깥에 흘리지 않는다. API 키는 절대 이 파일에 하드코딩하지 않는다(§2 A3) — 브라우저에서는
// baseUrl이 Cloudflare Workers 프록시를 가리키고, 그 프록시가 키를 붙여서 실제 API를 대신
// 호출한다. Actions(Node)에서는 baseUrl에 정부 API 주소를 직접 넣고 process.env로 받은 키를
// 얹어 호출해도 된다 — 이 파일은 "baseUrl + 정규화 로직"만 알고, 키가 어디서 오는지는 모른다.
//
// 2026-09-13 실제 API 키로 5개 엔드포인트 전부 실 응답 검증 완료 (PLAN.md 참고).

import { toKst } from './time.js';

const PTY_TO_PRECIP_TYPE = {
  0: 'none',
  1: 'rain',
  2: 'mixed',
  3: 'snow',
  4: 'shower',
  5: 'rain', // 빗방울 (초단기실황 전용 코드)
  6: 'mixed', // 빗방울눈날림
  7: 'snow', // 눈날림
};

const SKY_TO_CONDITION = { 1: 'clear', 3: 'cloudy', 4: 'overcast' };

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // 부분 실패는 전체 실패가 아니다 (§8) — 호출부가 폴백을 결정한다.
  }
}

// --- 기상청 초단기실황 (getUltraSrtNcst) ---------------------------------

/**
 * @param {object} raw response.body.items.item[] 형태의 원본 응답
 * @returns {{tempC: number, humidityPct: number, windSpeedMs: number, precipType: string} | null}
 */
export function normalizeCurrentWeather(raw) {
  const items = raw?.response?.body?.items?.item;
  if (!Array.isArray(items)) return null;

  const byCategory = Object.fromEntries(items.map((item) => [item.category, item.obsrValue]));
  const tempC = toNumber(byCategory.T1H);
  const humidityPct = toNumber(byCategory.REH);
  const windSpeedMs = toNumber(byCategory.WSD);
  const ptyCode = toNumber(byCategory.PTY) ?? 0;

  if (tempC === null) return null;
  return {
    tempC,
    humidityPct: humidityPct ?? 0,
    windSpeedMs: windSpeedMs ?? 0,
    precipType: PTY_TO_PRECIP_TYPE[ptyCode] ?? 'none',
  };
}

export async function getCurrentWeather({ baseUrl, nx, ny }) {
  const raw = await fetchJson(`${baseUrl}/weather/now?nx=${nx}&ny=${ny}`);
  return raw ? normalizeCurrentWeather(raw) : null;
}

// --- 기상청 단기예보 (getVilageFcst) --------------------------------------

/**
 * @param {object} raw response.body.items.item[] 형태의 원본 응답 (여러 발표시각 항목 혼재 가능)
 * @param {object} [options]
 * @param {number} [options.eveningHour] 퇴근 시각 기온을 뽑아올 시(0~23). PRD §8 — 옷차림 판정에 쓴다.
 * @param {string} [options.todayDate] "YYYYMMDD". TMN/TMX/퇴근시각 기온을 "오늘" 것으로만 한정할 때 쓴다.
 *   생략하면 응답에 처음 나오는 값을 그대로 쓴다(오늘/내일이 섞일 수 있음 — §12 함정 4 연장선).
 * @returns {{minTempC: number|null, maxTempC: number|null, popPercent: number, precipType: string,
 *            skyCondition: string, eveningTempC: number|null} | null}
 */
export function normalizeForecastWeather(raw, { eveningHour, todayDate } = {}) {
  const items = raw?.response?.body?.items?.item;
  if (!Array.isArray(items)) return null;

  // 같은 category가 시간대·발표시각별로 여러 번 나온다. TMN/TMX는 "오늘 날짜(fcstDate)로 처음
  // 나온 값"을 쓴다 — 안 그러면 이른 발표엔 없던 TMN이 늦은 발표에 내일 것으로 섞여 들어온다.
  const first = {};
  const minMax = {};
  let eveningTempC = null;
  let eveningTempDiff = Infinity;

  for (const item of items) {
    const isToday = !todayDate || String(item.fcstDate) === todayDate;

    if ((item.category === 'TMN' || item.category === 'TMX') && isToday && !(item.category in minMax)) {
      minMax[item.category] = toNumber(item.fcstValue);
    } else if (item.category !== 'TMN' && item.category !== 'TMX' && !(item.category in first)) {
      first[item.category] = item.fcstValue;
    }

    if (item.category === 'TMP' && typeof eveningHour === 'number' && isToday) {
      const fcstHour = Math.floor(toNumber(item.fcstTime) / 100);
      const diff = Math.abs(fcstHour - eveningHour);
      if (diff < eveningTempDiff) {
        eveningTempDiff = diff;
        eveningTempC = toNumber(item.fcstValue);
      }
    }
  }

  const ptyCode = toNumber(first.PTY) ?? 0;
  const skyCode = toNumber(first.SKY);

  return {
    minTempC: minMax.TMN ?? null,
    maxTempC: minMax.TMX ?? null,
    popPercent: toNumber(first.POP) ?? 0,
    precipType: PTY_TO_PRECIP_TYPE[ptyCode] ?? 'none',
    skyCondition: SKY_TO_CONDITION[skyCode] ?? 'unknown',
    eveningTempC,
  };
}

export async function getForecastWeather({ baseUrl, nx, ny, eveningHour }) {
  const raw = await fetchJson(`${baseUrl}/weather/forecast?nx=${nx}&ny=${ny}`);
  const todayDate = toKst(new Date()).dateKey.replaceAll('-', '');
  return raw ? normalizeForecastWeather(raw, { eveningHour, todayDate }) : null;
}

// --- 에어코리아 대기오염정보 (getMsrstnAcctoRltmMesureDnsty) ----------------

/**
 * @param {object} raw response.body.items[] 형태의 원본 응답
 * @returns {{pm10Grade: number, pm25Grade: number} | null}
 */
export function normalizeDustInfo(raw) {
  const items = raw?.response?.body?.items;
  const item = Array.isArray(items) ? items[0] : null;
  if (!item) return null;

  const pm10Grade = toNumber(item.pm10Grade);
  const pm25Grade = toNumber(item.pm25Grade);
  if (pm10Grade === null || pm25Grade === null) return null;

  return { pm10Grade, pm25Grade };
}

export async function getDustGrade({ baseUrl, stationName }) {
  const raw = await fetchJson(`${baseUrl}/dust?stationName=${encodeURIComponent(stationName)}`);
  return raw ? normalizeDustInfo(raw) : null;
}

// --- 한국천문연구원 특일 정보 (getRestDeInfo) -------------------------------

/**
 * @param {object} raw response.body.items.item[] 형태의 원본 응답
 * @returns {string[]} "YYYY-MM-DD" 형식 공휴일 목록 (isHoliday !== 'Y'인 기념일은 제외)
 */
export function normalizeHolidays(raw) {
  const items = raw?.response?.body?.items?.item;
  if (!items) return [];
  const list = Array.isArray(items) ? items : [items]; // 결과가 1건이면 배열이 아닌 객체로 오는 API가 많다.

  return list
    .filter((item) => item.isHoliday === 'Y')
    .map((item) => String(item.locdate))
    .filter((locdate) => /^\d{8}$/.test(locdate))
    .map((locdate) => `${locdate.slice(0, 4)}-${locdate.slice(4, 6)}-${locdate.slice(6, 8)}`);
}

export async function getHolidays({ baseUrl, year }) {
  const raw = await fetchJson(`${baseUrl}/holidays?year=${year}`);
  return raw ? normalizeHolidays(raw) : [];
}

// --- 서울시 버스 도착정보 (정류소별 도착예정정보, getStationByUid) ----------
// 2026-09-13 실제 키로 호출해 검증 완료. 응답은 msgBody.itemList[]이고, 노선번호는
// busRouteAbrv, 도착까지 남은 시간(초)은 traTime1/traTime2에 들어있다.
// (참고: 이 API는 공공데이터포털에서 "서울특별시_정류소정보조회 서비스"를 별도로
// 활용신청해야 인증키가 통한다 — 기상청 등 다른 3개와 활용신청 대상이 다르다.)

/**
 * @param {object} raw 정류소별 도착예정정보 원본 응답
 * @param {string[]} routes 이 방향에서 유효한 노선 번호 목록 (예: 출근길 103·173·202·261·262·7017·7021)
 * @returns {{route: string, minutes: number}[]} 도착까지 남은 시간 목록 (짧은 순). 몇 번 버스인지
 *   알아야 화면에 "103번 4분 뒤"처럼 보여줄 수 있어서, 분 숫자만이 아니라 노선번호도 같이 낸다.
 */
export function normalizeBusArrival(raw, routes) {
  const items = raw?.msgBody?.itemList;
  if (!Array.isArray(items)) return [];

  const routeSet = new Set(routes);
  const arrivals = [];
  for (const item of items) {
    if (!routeSet.has(item.busRouteAbrv)) continue;
    for (const key of ['traTime1', 'traTime2']) {
      const seconds = toNumber(item[key]);
      if (seconds !== null && seconds > 0) {
        arrivals.push({ route: item.busRouteAbrv, minutes: Math.round(seconds / 60) });
      }
    }
  }
  return arrivals.sort((a, b) => a.minutes - b.minutes);
}

export async function getBusArrival({ baseUrl, stopId, routes }) {
  const raw = await fetchJson(`${baseUrl}/bus/arrival?stopId=${stopId}`);
  return raw ? normalizeBusArrival(raw, routes) : [];
}
