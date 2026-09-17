// 설정값 로드/저장. localStorage만 다룬다 — 이 파일이 유일한 저장소 경계다.
// planner/businessday/weather처럼 순수 함수만 두는 파일이 아니다 — sources.js가 fetch 경계이듯,
// 이 파일은 localStorage 경계다.
//
// DEFAULT_CONFIG에는 실제 확정값(PRD.md §8/§14, 2026-09-13~17 확정)이 들어있다 — CLAUDE.md §2 A4의
// "더미값만" 원칙에서 사용자 요청으로 벗어난 예외다(2026-09-17). 이미 PRD.md/CLAUDE.md/PLAN.md에
// 평문으로 적혀있는 값들이라 노출 범위가 새로 늘지는 않는다. 설정 화면에서 언제든 값을 바꿀 수
// 있고, 바꾼 값은 이 파일이 아니라 localStorage에만 남는다.

const STORAGE_KEY = 'gonow.config.v1';

// Cloudflare Workers 프록시 배포 주소. 브라우저(page.js)와 Actions(scripts/*.mjs) 양쪽이 이걸 쓴다 —
// Actions도 CORS 제약이 없을 뿐 똑같이 이 프록시를 거쳐서 키를 감춘 채 호출한다(§2 A3, A7).
export const PROXY_BASE_URL = 'https://gonow-proxy.enwise.workers.dev';

export const DEFAULT_CONFIG = {
  profile: { targetArrival: '08:20' },
  businessDay: {
    weekdays: [1, 2, 3, 4, 5],
    useHolidayApi: true,
    overrides: [],
    remoteDayBriefing: true,
  },
  legs: [
    { type: 'walk', id: 'd1', from: '집', to: '운정중앙역', minutes: 10 },
    { type: 'gate', id: 'd2', at: '운정중앙역', minutes: 5 },
    { type: 'rail', line: 'GTX-A', from: '운정중앙', to: '서울역', rideMinutes: 22, timetableRef: 'data/gtx-a.json' },
    { type: 'walk', id: 'd3', from: '서울역', to: '서울역 6번 승강장', minutes: 7 },
    {
      type: 'bus',
      boardStopId: '02006',
      alightStopId: '02139',
      stopLabel: '',
      routes: ['103', '173', '202', '261', '262', '7017', '7021'],
      rideMinutes: 11,
    },
    { type: 'walk', id: 'd4', from: '우리은행종로지점', to: '교원빌딩', minutes: 5 },
  ],
  buffers: { rail: 2, busTransfer: 3, final: 5 },
  weather: {
    origin: { nx: 55, ny: 130, label: '운정' },
    destination: { nx: 60, ny: 127, label: '명동' },
    airStation: '중구',
    eveningHour: 18,
    adjust: { rainWalkPct: 20, rainBusMin: 5, snowWalkPct: 40, snowBusMin: 8, extremeWalkPct: 10 },
    umbrella: { needPop: 60, foldablePop: 30 },
  },
  wardrobe: [
    { min: 28, text: '반팔·린넨' },
    { min: 23, text: '반팔·얇은 셔츠' },
    { min: 20, text: '긴팔·얇은 가디건' },
    { min: 17, text: '얇은 니트·맨투맨' },
    { min: 12, text: '자켓·가디건' },
    { min: 9, text: '트렌치코트·얇은 패딩' },
    { min: 5, text: '코트·히트텍' },
    { min: -99, text: '패딩·두꺼운 코트·목도리' },
  ],
  checklist: ['사원증', '노트북'],
  notify: {
    channel: 'telegram',
    briefingAt: '07:00',
    leaveReminderBefore: 5,
    silentOnNonBusinessDay: true,
  },
};

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override ?? base;
  }
  if (typeof base === 'object' && base !== null && typeof override === 'object' && override !== null) {
    const result = { ...base };
    for (const key of Object.keys(override)) {
      result[key] = deepMerge(base[key], override[key]);
    }
    return result;
  }
  return override ?? base;
}

/**
 * localStorage에 저장된 설정을 DEFAULT_CONFIG와 합쳐서 돌려준다.
 * 서버(빌드 타임)에서는 window가 없으므로 DEFAULT_CONFIG를 그대로 준다.
 */
export function loadConfig() {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return deepMerge(DEFAULT_CONFIG, JSON.parse(raw));
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
