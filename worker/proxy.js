// Cloudflare Workers 프록시. CORS 우회 + API 키 은닉 + 캐시만 담당한다 — 그 이상의 역할은 주지
// 않는다(비즈니스 로직 금지, PRD §6.2 결정1). 계산·정규화는 src/lib/sources.js가 한다.
//
// 필요한 Secret (wrangler secret put로 등록, 이 파일에는 절대 값 자체를 적지 않는다 — §2 A3):
//   SEOUL_API_KEY    서울 열린데이터광장 인증키 (버스 도착정보용)
//   DATA_GO_KR_KEY   공공데이터포털 인증키 (기상청·에어코리아·특일정보 공용)

import { toKst } from '../src/lib/time.js';

const CACHE_TTL_SECONDS = {
  '/bus/arrival': 30,
  '/weather/now': 600,
  '/weather/forecast': 600,
  '/dust': 600,
  '/holidays': 60 * 60 * 24 * 30,
};

const CORS_HEADERS = {
  // 개인용 정적 사이트 1개만 부르는 프록시라 오리진을 넓게 허용한다. 악용 흔적이 보이면 그때 좁힌다 (R8).
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function jsonResponse(data, ttlSeconds) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttlSeconds}`,
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(message, status = 502) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// 기상청 초단기실황(getUltraSrtNcst)은 매시 40분에 생성되고 45분부터 조회 가능하다.
// 45분 전이면 직전 시각 발표값으로 폴백한다 (§12 함정 4, PRD R7).
function resolveUltraSrtBaseTime(now) {
  const { minutesSinceMidnight } = toKst(now);
  const hour = Math.floor(minutesSinceMidnight / 60);
  const minute = minutesSinceMidnight % 60;
  const baseHour = minute < 45 ? hour - 1 : hour;
  const baseDate = baseHour < 0 ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  const wrappedHour = ((baseHour % 24) + 24) % 24;
  return {
    baseDate: toKst(baseDate).dateKey.replaceAll('-', ''),
    baseTime: `${String(wrappedHour).padStart(2, '0')}00`,
  };
}

// 단기예보(getVilageFcst)는 하루 8번(02,05,08,11,14,17,20,23시)만 발표되고, 반영까지 약 10분
// 걸린다. 가장 최근에 "이미 반영됐을" 발표시각을 고른다 (§12 함정 4).
const VILAGE_FCST_HOURS = [23, 20, 17, 14, 11, 8, 5, 2]; // 내림차순 — 가장 최근 것부터 찾는다.
function resolveVilageFcstBaseTime(now) {
  const { minutesSinceMidnight } = toKst(now);
  const currentHour = minutesSinceMidnight / 60;

  for (const hour of VILAGE_FCST_HOURS) {
    if (currentHour >= hour + 10 / 60) {
      return { baseDate: toKst(now).dateKey.replaceAll('-', ''), baseTime: `${String(hour).padStart(2, '0')}00` };
    }
  }
  // 새벽 2시10분 이전 — 전날 23시 발표로 폴백.
  const prevDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return { baseDate: toKst(prevDate).dateKey.replaceAll('-', ''), baseTime: '2300' };
}

// TMN(오늘 최저)은 02시 발표에만 실려 있고, 그 이후 발표부터는 빠진다(실제 응답으로 확인,
// 2026-09-17). "가장 최근 발표"만 보면 낮 시간대엔 오늘 최저기온이 통째로 사라진다 — 그래서
// 02시 발표를 하나 더 불러와 합친다.
function resolveEarlyVilageFcstBaseTime(now) {
  const { minutesSinceMidnight, dateKey } = toKst(now);
  if (minutesSinceMidnight >= 2 * 60 + 10) {
    return { baseDate: dateKey.replaceAll('-', ''), baseTime: '0200' };
  }
  const prevDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return { baseDate: toKst(prevDate).dateKey.replaceAll('-', ''), baseTime: '2300' };
}

async function fetchUpstreamJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function handleWeatherNow(env, searchParams) {
  const { baseDate, baseTime } = resolveUltraSrtBaseTime(new Date());
  const upstream = new URL('https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst');
  upstream.searchParams.set('serviceKey', env.DATA_GO_KR_KEY);
  upstream.searchParams.set('dataType', 'JSON');
  upstream.searchParams.set('numOfRows', '10');
  upstream.searchParams.set('base_date', baseDate);
  upstream.searchParams.set('base_time', baseTime);
  upstream.searchParams.set('nx', searchParams.get('nx'));
  upstream.searchParams.set('ny', searchParams.get('ny'));
  return fetchUpstreamJson(upstream);
}

function buildVilageFcstUrl(env, { baseDate, baseTime }, searchParams) {
  const upstream = new URL('https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst');
  upstream.searchParams.set('serviceKey', env.DATA_GO_KR_KEY);
  upstream.searchParams.set('dataType', 'JSON');
  upstream.searchParams.set('numOfRows', '300');
  upstream.searchParams.set('base_date', baseDate);
  upstream.searchParams.set('base_time', baseTime);
  upstream.searchParams.set('nx', searchParams.get('nx'));
  upstream.searchParams.set('ny', searchParams.get('ny'));
  return upstream;
}

async function handleWeatherForecast(env, searchParams) {
  const now = new Date();
  const latest = await fetchUpstreamJson(buildVilageFcstUrl(env, resolveVilageFcstBaseTime(now), searchParams));
  const early = await fetchUpstreamJson(buildVilageFcstUrl(env, resolveEarlyVilageFcstBaseTime(now), searchParams));

  const latestItems = latest?.response?.body?.items?.item ?? [];
  const earlyItems = early?.response?.body?.items?.item ?? [];
  // sources.js의 normalizeForecastWeather는 카테고리별 "처음 나온 값"을 쓴다 — early를 뒤에
  // 붙이면 TMN/TMX는 early에서, 그 외 근접 예보는 latest에서 우선 채택된다.
  latest.response.body.items.item = [...latestItems, ...earlyItems];
  return latest;
}

async function handleDust(env, searchParams) {
  const upstream = new URL('https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty');
  upstream.searchParams.set('serviceKey', env.DATA_GO_KR_KEY);
  upstream.searchParams.set('returnType', 'json');
  upstream.searchParams.set('numOfRows', '1');
  upstream.searchParams.set('dataTerm', 'DAILY');
  upstream.searchParams.set('ver', '1.3');
  upstream.searchParams.set('stationName', searchParams.get('stationName'));
  return fetchUpstreamJson(upstream);
}

async function handleHolidays(env, searchParams) {
  const upstream = new URL('https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo');
  upstream.searchParams.set('serviceKey', env.DATA_GO_KR_KEY);
  upstream.searchParams.set('_type', 'json');
  upstream.searchParams.set('numOfRows', '100');
  upstream.searchParams.set('solYear', searchParams.get('year'));
  return fetchUpstreamJson(upstream);
}

async function handleBusArrival(env, searchParams) {
  // 이 API(getStationByUid)는 서울 열린데이터광장이 아니라 공공데이터포털에서 발급받은
  // 키("서울특별시_정류소정보조회" 활용신청)로 인증한다 — 아직 검증 중, §14 참고.
  const upstream = new URL('http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid');
  upstream.searchParams.set('ServiceKey', env.DATA_GO_KR_KEY);
  upstream.searchParams.set('resultType', 'json');
  upstream.searchParams.set('arsId', searchParams.get('stopId'));
  return fetchUpstreamJson(upstream);
}

const ROUTES = {
  '/weather/now': handleWeatherNow,
  '/weather/forecast': handleWeatherForecast,
  '/dust': handleDust,
  '/holidays': handleHolidays,
  '/bus/arrival': handleBusArrival,
};

const worker = {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];
    if (!handler) {
      return errorResponse(`알 수 없는 경로: ${url.pathname}`, 404);
    }

    try {
      const data = await handler(env, url.searchParams);
      return jsonResponse(data, CACHE_TTL_SECONDS[url.pathname]);
    } catch (err) {
      return errorResponse(`업스트림 호출 실패: ${err.message}`);
    }
  },
};

export default worker;
