// planner.js 고정 입력 검증 (CLAUDE.md §10). 테스트 프레임워크 없이 node 내장 assert만 쓴다.
// 실행: node scripts/check-planner.mjs
// UTC 확인: TZ=UTC node scripts/check-planner.mjs (결과가 동일해야 한다)
//
// 타임테이블은 알고리즘 검증용 임의 값이다. 실제 GTX-A 시간표(data/gtx-a.json)는 아직
// 사용자가 확인해주지 않아 여기 있는 시각을 진짜 시간표로 오해하면 안 된다 (CLAUDE.md §11).

import assert from 'node:assert/strict';
import { plan } from '../src/lib/planner.js';

const config = {
  profile: { targetArrival: '08:20' },
  legs: [
    { type: 'walk', id: 'd1', from: '집', to: '운정중앙역', minutes: 10 },
    { type: 'gate', id: 'd2', at: '운정중앙역', minutes: 5 },
    { type: 'rail', line: 'GTX-A', from: '운정중앙', to: '서울역', rideMinutes: 22 },
    { type: 'walk', id: 'd3', from: '서울역 승강장', to: '서울역 6번 승강장', minutes: 7 },
    { type: 'bus', from: '서울역 6번 승강장', to: '우리은행종로지점', rideMinutes: 11 },
    { type: 'walk', id: 'd4', from: '우리은행종로지점', to: '교원빌딩', minutes: 5 },
  ],
  buffers: { rail: 2, busTransfer: 3, final: 5 },
  weather: { adjust: { rainWalkPct: 20, rainBusMin: 5, snowWalkPct: 40, snowBusMin: 8, extremeWalkPct: 10 } },
};

// 임의 시험용 시간표(6~7분 간격) — 실제 시간표 아님.
const timetable = ['07:12', '07:19', '07:26', '07:33', '07:40', '07:47', '07:54', '08:01'];

let passed = 0;
function check(label, actual, assertion) {
  assertion(actual);
  passed += 1;
  console.log(`ok - ${label}`);
}

// 평일 정상 케이스 — 목표 08:20, 최종버퍼 5분이니 08:15까지 도착해야 한다.
// (총 소요가 편도 약 70분이라 08:20 도착하려면 07시 초반에는 나서야 한다 — 07:30은 이미 늦은 시각이다.)
{
  const result = plan({
    now: new Date('2026-09-14T06:50:00+09:00'),
    timetable,
    busArrival: [{ route: '103', minutes: 4 }, { route: '103', minutes: 12 }],
    weather: {},
    config,
  });
  check('평일 정상 케이스는 GO 또는 WAIT', result, (r) => {
    assert.ok(['GO', 'WAIT'].includes(r.status), `status=${r.status}`);
    assert.ok(r.arriveAt <= '08:15', `arriveAt=${r.arriveAt}`);
    assert.ok(r.reasons.some((reason) => reason.includes('GTX')), 'GTX 근거가 reasons에 있어야 한다');
  });
}

// 막차 이후 — 이 시간표 안에서 도저히 탈 수 없는 늦은 시각이면 LATE여야 한다.
{
  const result = plan({
    now: new Date('2026-09-14T08:10:00+09:00'),
    timetable,
    busArrival: [{ route: '103', minutes: 4 }, { route: '103', minutes: 12 }],
    weather: {},
    config,
  });
  check('막차 이후 시각은 LATE', result, (r) => {
    assert.equal(r.status, 'LATE');
  });
}

// 첫차 이전 — 이른 새벽이라 탈 수 있는 편이 여러 개 있어도, 목표를 지키는 한도 내에서
// "가장 늦게 떠나도 되는" 편을 고른다 (불필요하게 일찍 나가라고 하지 않는다, §7).
{
  const result = plan({
    now: new Date('2026-09-14T05:00:00+09:00'),
    timetable,
    busArrival: [{ route: '103', minutes: 4 }, { route: '103', minutes: 12 }],
    weather: {},
    config,
  });
  check('첫차 이전 시각은 WAIT', result, (r) => {
    assert.equal(r.status, 'WAIT');
    assert.ok(r.reasons.some((reason) => reason.includes('07:19')), '목표를 지키는 가장 늦은 편(07:19)을 기준으로 잡아야 한다');
  });
}

// 버스 API 빈 응답 → 추정 모드로 폴백하고 그 사실이 reasons에 표시된다.
{
  const result = plan({
    now: new Date('2026-09-14T07:30:00+09:00'),
    timetable,
    busArrival: [],
    weather: {},
    config,
  });
  check('버스 정보 없으면 추정 모드 표시', result, (r) => {
    assert.ok(r.reasons.includes('버스 정보 없음 — 시간표 기준 추정'));
  });
}

// 비 예보 시 출발시각이 실제로 앞당겨진다 (도보 구간이 늘어나므로 leaveAt이 더 일러야 한다).
// 두 경우 모두 목표를 지킬 수 있는 시각으로 비교해야 의미가 있다(둘 다 LATE면 비교가 무의미해진다).
{
  const base = { now: new Date('2026-09-14T06:30:00+09:00'), timetable, busArrival: [{ route: '103', minutes: 4 }, { route: '103', minutes: 12 }], config };
  const dry = plan({ ...base, weather: {} });
  const rainy = plan({ ...base, weather: { isRaining: true } });
  check('비 예보면 더 일찍 출발해야 한다', { dry, rainy }, ({ dry: d, rainy: r }) => {
    assert.ok(r.leaveAt <= d.leaveAt, `dry=${d.leaveAt} rainy=${r.leaveAt}`);
    assert.ok(r.reasons.some((reason) => reason.includes('비 예보')));
  });
}

console.log(`\n총 ${passed}건 통과`);
