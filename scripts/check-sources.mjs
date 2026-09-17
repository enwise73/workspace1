// sources.js 정규화 함수 고정 입력 검증 (CLAUDE.md §10). 실제 fetch는 하지 않는다 — 문서 스펙
// 기준으로 만든 가짜 원본 응답(fixture)을 넣고, 정규화 결과가 기대한 깨끗한 형태로 나오는지만 본다.
// 실행: node scripts/check-sources.mjs

import assert from 'node:assert/strict';
import {
  normalizeCurrentWeather,
  normalizeForecastWeather,
  normalizeDustInfo,
  normalizeHolidays,
  normalizeBusArrival,
} from '../src/lib/sources.js';

let passed = 0;
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, `${label}\n  실제: ${JSON.stringify(actual)}\n  기대: ${JSON.stringify(expected)}`);
  passed += 1;
  console.log(`ok - ${label}`);
}

// 초단기실황 — 값이 전부 문자열로 온다 (§12 함정 5).
check(
  '초단기실황 정규화',
  normalizeCurrentWeather({
    response: {
      body: {
        items: {
          item: [
            { category: 'T1H', obsrValue: '18' },
            { category: 'REH', obsrValue: '62' },
            { category: 'WSD', obsrValue: '2.1' },
            { category: 'PTY', obsrValue: '1' },
          ],
        },
      },
    },
  }),
  { tempC: 18, humidityPct: 62, windSpeedMs: 2.1, precipType: 'rain' },
);

check('초단기실황 — 형태가 다르면 null', normalizeCurrentWeather({ response: {} }), null);

// 단기예보 — TMN/TMX는 하루 1번, 나머지는 3시간마다 여러 번 온다. 가장 이른(첫) 값을 쓴다.
// eveningHour(18시)를 주면 그 시각에 가장 가까운 TMP를 퇴근 시각 기온으로 뽑는다.
check(
  '단기예보 정규화',
  normalizeForecastWeather(
    {
      response: {
        body: {
          items: {
            item: [
              { category: 'TMN', fcstDate: '20260914', fcstValue: '15' },
              { category: 'TMX', fcstDate: '20260914', fcstValue: '24' },
              { category: 'POP', fcstDate: '20260914', fcstTime: '0600', fcstValue: '70' },
              { category: 'POP', fcstDate: '20260914', fcstTime: '0900', fcstValue: '80' }, // 이후 시간대 — 무시해야 한다
              { category: 'PTY', fcstDate: '20260914', fcstTime: '0600', fcstValue: '1' },
              { category: 'SKY', fcstDate: '20260914', fcstTime: '0600', fcstValue: '4' },
              { category: 'TMP', fcstDate: '20260914', fcstTime: '0600', fcstValue: '17' },
              { category: 'TMP', fcstDate: '20260914', fcstTime: '1800', fcstValue: '13' },
              { category: 'TMP', fcstDate: '20260914', fcstTime: '2100', fcstValue: '11' },
            ],
          },
        },
      },
    },
    { eveningHour: 18, todayDate: '20260914' },
  ),
  { minTempC: 15, maxTempC: 24, popPercent: 70, precipType: 'rain', skyCondition: 'overcast', eveningTempC: 13 },
);

// 단기예보 — 오늘 TMN이 이른 발표에만 있고, 늦은 발표(합쳐진 응답)엔 내일 TMN만 있는 상황.
// todayDate로 걸러야 "내일 최저기온"이 "오늘 최저기온" 자리에 섞여 들어오지 않는다.
check(
  '단기예보 — 오늘 발표가 없어도 내일 TMN이 오늘 자리를 덮어쓰지 않는다',
  normalizeForecastWeather(
    {
      response: {
        body: {
          items: {
            item: [
              { category: 'TMX', fcstDate: '20260914', fcstValue: '29' }, // 오늘 최고만 남아있음(정상)
              { category: 'TMN', fcstDate: '20260915', fcstValue: '16' }, // 내일 최저 — 오늘 것 아님
              { category: 'TMX', fcstDate: '20260915', fcstValue: '27' },
            ],
          },
        },
      },
    },
    { todayDate: '20260914' },
  ),
  { minTempC: null, maxTempC: 29, popPercent: 0, precipType: 'none', skyCondition: 'unknown', eveningTempC: null },
);

// 에어코리아 — 등급은 문자열 "1"~"4"로 온다.
check(
  '미세먼지 정규화',
  normalizeDustInfo({ response: { body: { items: [{ pm10Grade: '3', pm25Grade: '2', stationName: '중구' }] } } }),
  { pm10Grade: 3, pm25Grade: 2 },
);
check('미세먼지 — 관측소 없음이면 null', normalizeDustInfo({ response: { body: { items: [] } } }), null);

// 특일정보 — 배열/단일객체 둘 다 오고, 공휴일 아닌 기념일(isHoliday !== 'Y')은 제외한다.
check(
  '특일정보 정규화 — 여러 건',
  normalizeHolidays({
    response: {
      body: {
        items: {
          item: [
            { locdate: 20260925, dateName: '추석', isHoliday: 'Y' },
            { locdate: 20260926, dateName: '추석', isHoliday: 'Y' },
            { locdate: 20260605, dateName: '식목일', isHoliday: 'N' }, // 공휴일 아님 — 제외
          ],
        },
      },
    },
  }),
  ['2026-09-25', '2026-09-26'],
);
check(
  '특일정보 정규화 — 결과 1건이면 배열이 아닌 객체로 온다',
  normalizeHolidays({ response: { body: { items: { item: { locdate: 20260101, isHoliday: 'Y' } } } } }),
  ['2026-01-01'],
);
check('특일정보 — 응답 없으면 빈 배열', normalizeHolidays({ response: {} }), []);

// 버스 도착정보 — 우리 노선만 걸러내고, 초를 분으로 바꾼다.
// (필드명 traTime1/2, busRouteAbrv는 2026-09-13 실제 API 응답으로 검증된 값이다.)
check(
  '버스 도착정보 정규화 — 우리 노선만, 짧은 순 정렬',
  normalizeBusArrival(
    {
      msgBody: {
        itemList: [
          { busRouteAbrv: '103', traTime1: '180', traTime2: '600' }, // 3분, 10분
          { busRouteAbrv: '405', traTime1: '60' }, // 우리 노선 아님 — 제외
          { busRouteAbrv: '7017', traTime1: '90' }, // 1.5분 -> 반올림 2분
        ],
      },
    },
    ['103', '173', '202', '261', '262', '7017', '7021'],
  ),
  [
    { route: '7017', minutes: 2 },
    { route: '103', minutes: 3 },
    { route: '103', minutes: 10 },
  ],
);
check('버스 도착정보 — 형태가 다르면 빈 배열', normalizeBusArrival({}, ['103']), []);

console.log(`\n총 ${passed}건 통과`);
