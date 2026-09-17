// 설정값 로드/저장. localStorage만 다룬다 — 이 파일이 유일한 저장소 경계다.
// planner/businessday/weather처럼 순수 함수만 두는 파일이 아니다 — sources.js가 fetch 경계이듯,
// 이 파일은 localStorage 경계다.
//
// 여기 적힌 DEFAULT_CONFIG는 전부 더미값이다 (CLAUDE.md §2 A4). 집 위치·정류장 ID·실측 도보시간
// 같은 실제 값은 저장소에 커밋되는 이 파일이 아니라, 설정 화면에서 입력해 localStorage에만 남는다.

const STORAGE_KEY = 'gonow.config.v1';

// Cloudflare Workers 프록시 배포 주소. 브라우저(page.js)와 Actions(scripts/*.mjs) 양쪽이 이걸 쓴다 —
// Actions도 CORS 제약이 없을 뿐 똑같이 이 프록시를 거쳐서 키를 감춘 채 호출한다(§2 A3, A7).
export const PROXY_BASE_URL = 'https://gonow-proxy.enwise.workers.dev';

export const DEFAULT_CONFIG = {
  profile: { targetArrival: '08:00' },
  businessDay: {
    weekdays: [1, 2, 3, 4, 5],
    useHolidayApi: true,
    overrides: [],
    remoteDayBriefing: true,
  },
  legs: [
    { type: 'walk', id: 'd1', from: '집', to: '역', minutes: 10 },
    { type: 'gate', id: 'd2', at: '역', minutes: 5 },
    { type: 'rail', line: '', from: '', to: '', rideMinutes: 20, timetableRef: 'data/gtx-a.json' },
    { type: 'walk', id: 'd3', from: '', to: '', minutes: 5 },
    { type: 'bus', boardStopId: '', alightStopId: '', stopLabel: '', routes: [], rideMinutes: 10 },
    { type: 'walk', id: 'd4', from: '', to: '', minutes: 5 },
  ],
  buffers: { rail: 2, busTransfer: 3, final: 5 },
  weather: {
    // 0,0은 실제 기상청 격자에 없는 값이라 "아직 안 채웠다"는 게 명백하다. 둘 다 60/127 같은
    // 그럴듯한 값을 기본으로 두면, 안 채웠는지 채웠는지 화면만 봐서는 구분이 안 된다.
    origin: { nx: 0, ny: 0, label: '' },
    destination: { nx: 0, ny: 0, label: '' },
    airStation: '',
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
