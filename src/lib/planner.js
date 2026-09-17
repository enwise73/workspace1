// 역산 엔진. 순수 함수 — DOM/fetch/localStorage를 직접 호출하지 않는다 (CLAUDE.md §4).
// 현재 시각도 인자로 받는다: plan({ now, timetable, busArrival, weather, config }).
// 이 규칙 덕분에 시각을 고정해 검증할 수 있다 (§4, §10).
//
// 핵심 원칙(§7): "평균 소요시간 합산"이 아니라 "실제 탑승 가능한 특정 편을 고정"한다.
// d1+d2 이후 도착 가능한 가장 이른 GTX 편을 기준으로, 그 편을 탔을 때 목표 도착시각을
// 지킬 수 있는지 뒤에서부터 확인한다. 여러 편이 가능하면 그중 "가장 늦게 떠나도 되는" 편을
// 고른다 — 그래야 불필요하게 일찍 집을 나서라고 하지 않는다.

import { toKst, parseHHMM, formatHHMM } from './time.js';

function findLeg(legs, predicate) {
  const match = typeof predicate === 'string' ? (leg) => leg.id === predicate : predicate;
  const leg = legs.find(match);
  if (!leg) {
    throw new Error(`leg을 찾을 수 없음: ${predicate}`);
  }
  return leg;
}

// 비/눈/혹한혹서 보정을 하나로 합친다 (§4.5). 강풍·호우 등 기상특보 보정(F-18)은 아직 미구현.
function resolveWeatherAdjust(weather, adjust) {
  let walkPct = 0;
  let busExtraMin = 0;
  const notes = [];

  const isRaining = weather.isRaining || (weather.popPercent ?? 0) >= 60;
  if (weather.isSnowing) {
    walkPct += adjust.snowWalkPct;
    busExtraMin += adjust.snowBusMin;
    notes.push('눈 예보로 도보·버스 지연 반영');
  } else if (isRaining) {
    walkPct += adjust.rainWalkPct;
    busExtraMin += adjust.rainBusMin;
    notes.push('비 예보로 도보 지연 반영');
  }

  if (typeof weather.feelsLike === 'number' && (weather.feelsLike <= -5 || weather.feelsLike >= 33)) {
    walkPct += adjust.extremeWalkPct;
    notes.push('체감온도 영향으로 도보 지연 반영');
  }

  return { walkPct, busExtraMin, notes };
}

/**
 * 특정 GTX 출발편을 탄다고 가정하고 끝까지 순방향으로 시뮬레이션한다.
 * @returns 그 편을 타기 위한 leaveHomeAt, 최종 officeArrival, 구간별 타임라인(legsTimeline)
 */
function simulateDeparture(departureMinutes, { legs, buffers, walkFactor, busExtraMin, busArrival }) {
  const d1 = findLeg(legs, 'd1');
  const d2 = findLeg(legs, 'd2');
  const rail = findLeg(legs, (leg) => leg.type === 'rail');
  const d3 = findLeg(legs, 'd3');
  const bus = findLeg(legs, (leg) => leg.type === 'bus');
  const d4 = findLeg(legs, 'd4');

  const d1Minutes = Math.ceil(d1.minutes * walkFactor);
  const d3Minutes = Math.ceil(d3.minutes * walkFactor);
  const d4Minutes = Math.ceil(d4.minutes * walkFactor);

  const platformDeadline = departureMinutes - buffers.rail; // 이 시각까지 승강장에 있어야 편을 놓치지 않는다
  const leaveHomeAt = platformDeadline - d2.minutes - d1Minutes;

  const seoulArrival = departureMinutes + rail.rideMinutes;
  const busStopArrival = seoulArrival + d3Minutes;

  // busArrival: [{route, minutes}] — 도착 임박한 순으로 정렬돼 있다고 가정한다.
  let busWaitMinutes;
  let busIsEstimated = false;
  let soonestBus = null;
  if (busArrival && busArrival.length > 0) {
    soonestBus = busArrival[0];
    busWaitMinutes = soonestBus.minutes + buffers.busTransfer;
  } else {
    // 실시간 도착정보가 없으면 환승 버퍼만큼만 대기한다고 보수적으로 가정하고, 추정임을 표시한다 (§8).
    busWaitMinutes = buffers.busTransfer;
    busIsEstimated = true;
  }
  const busRideMinutes = bus.rideMinutes + busExtraMin;
  const busBoardAt = busStopArrival + busWaitMinutes;
  const busAlightAt = busBoardAt + busRideMinutes;

  const officeArrival = busAlightAt + d4Minutes;

  const timeline = [
    { time: formatHHMM(leaveHomeAt), mode: 'walk', label: `${d1.from} → ${d1.to} 도보`, duration: `${d1Minutes}분` },
    { time: formatHHMM(platformDeadline), mode: 'walk', label: `${d2.at} 개찰 → 승강장`, duration: `${d2.minutes}분` },
    {
      time: formatHHMM(departureMinutes),
      mode: 'rail',
      label: `${rail.line} ${rail.to} 방면`,
      duration: `${rail.rideMinutes}분`,
    },
    { time: formatHHMM(seoulArrival), mode: 'walk', label: `${d3.from} → ${d3.to} 도보`, duration: `${d3Minutes}분` },
    {
      time: formatHHMM(busBoardAt),
      mode: 'bus',
      label: soonestBus ? `버스 ${soonestBus.route}번` : '버스',
      duration: `${busRideMinutes}분`,
      live: busIsEstimated ? null : `실시간 ${soonestBus.minutes}분 뒤`,
    },
    { time: formatHHMM(busAlightAt), mode: 'walk', label: `${d4.from} → ${d4.to} 도보`, duration: `${d4Minutes}분` },
    { time: formatHHMM(officeArrival), mode: 'arrive', label: '도착', duration: '', arrive: true },
  ];

  return { leaveHomeAt, officeArrival, departureMinutes, busIsEstimated, timeline };
}

/**
 * 출발각(verdict)을 계산한다.
 * @param {object} input
 * @param {Date} input.now 판정 기준 시각
 * @param {string[]} input.timetable GTX-A 운정중앙발 출발시각 목록 ("HH:MM", 자정 넘김은 "24:MM" 허용)
 * @param {number[]} [input.busArrival] 하차 정류장 실시간 도착정보(분 단위 카운트다운). 없으면 추정 모드.
 * @param {object} [input.weather] { isRaining, popPercent, isSnowing, feelsLike }
 * @param {object} input.config PRD §8의 설정 데이터 모델 (profile/legs/buffers/weather.adjust)
 * @returns {{status: 'GO'|'WAIT'|'LATE', leaveAt: string, window: [string, string], countdown: string,
 *            plan: object[], arriveAt: string, slack: number, reasons: string[]}}
 */
export function plan({ now, timetable, busArrival, weather = {}, config }) {
  const { minutesSinceMidnight: nowMinutes } = toKst(now);
  const targetMinutes = parseHHMM(config.profile.targetArrival);
  const { walkPct, busExtraMin, notes: weatherNotes } = resolveWeatherAdjust(weather, config.weather.adjust);
  const walkFactor = 1 + walkPct / 100;

  const simContext = { legs: config.legs, buffers: config.buffers, walkFactor, busExtraMin, busArrival };

  const d1 = findLeg(config.legs, 'd1');
  const d2 = findLeg(config.legs, 'd2');
  const earliestPlatformArrival = nowMinutes + Math.ceil(d1.minutes * walkFactor) + d2.minutes;

  const departures = [...new Set(timetable.map(parseHHMM))].sort((a, b) => a - b);
  const reachable = departures.filter((departure) => departure - config.buffers.rail >= earliestPlatformArrival);

  if (reachable.length === 0) {
    return {
      status: 'LATE',
      leaveAt: formatHHMM(nowMinutes),
      window: [formatHHMM(nowMinutes), formatHHMM(nowMinutes)],
      countdown: '지금 출발',
      plan: [],
      arriveAt: null,
      slack: null,
      reasons: ['오늘 남은 GTX-A 편이 없습니다 (시간표 확인 필요)'],
    };
  }

  const effectiveTargetMinutes = targetMinutes - config.buffers.final;

  let chosen = null;
  for (let i = reachable.length - 1; i >= 0; i -= 1) {
    const result = simulateDeparture(reachable[i], simContext);
    if (result.officeArrival <= effectiveTargetMinutes) {
      chosen = result;
      break;
    }
  }

  // 가장 이른 편으로도 목표를 못 맞추면, 그 편을 "최선의 계획"으로 보여주고 LATE로 표시한다.
  const isLate = !chosen;
  const result = chosen ?? simulateDeparture(reachable[0], simContext);

  const leaveAtMinutes = Math.max(result.leaveHomeAt, isLate ? nowMinutes : result.leaveHomeAt);
  const status = isLate ? 'LATE' : leaveAtMinutes <= nowMinutes ? 'GO' : 'WAIT';
  const countdownMinutes = leaveAtMinutes - nowMinutes;
  const countdown = countdownMinutes <= 0 ? '지금 출발' : `${countdownMinutes}분 뒤`;

  const reasons = [`GTX ${formatHHMM(result.departureMinutes)}편 기준`, ...weatherNotes];
  if (result.busIsEstimated) {
    reasons.push('버스 정보 없음 — 시간표 기준 추정');
  }
  if (isLate) {
    reasons.push('가장 이른 편으로도 목표 도착시각을 넘깁니다');
  }

  // 출발 창(window)의 지연 내성 폭은 알림 스케줄(Actions cron)을 만들 때 함께 정한다 — 지금은 점으로만 표시.
  const leaveAtLabel = formatHHMM(leaveAtMinutes);

  return {
    status,
    leaveAt: leaveAtLabel,
    window: [leaveAtLabel, leaveAtLabel],
    countdown,
    plan: result.timeline,
    arriveAt: formatHHMM(result.officeArrival),
    slack: targetMinutes - result.officeArrival,
    reasons,
  };
}
