// 출발 리마인더. .github/workflows/reminder.yml이 통근 시간대에 5분 간격으로 실행한다(F-26).
// 실행: node scripts/reminder.mjs
//
// 이 스크립트는 "상태 저장" 없이 매번 새로 계산한다 — 대신 "권장 출발시각 N분 전" 구간이
// 폴링 간격(5분)만큼의 폭을 가진다고 보고, 그 구간에 들어온 실행 한 번에서만 보낸다.
// 그래서 POLL_INTERVAL_MINUTES는 반드시 워크플로의 cron 간격과 같아야 한다.

import { isBusinessDay } from '../src/lib/businessday.js';
import { plan } from '../src/lib/planner.js';
import { getBusArrival } from '../src/lib/sources.js';
import { PROXY_BASE_URL } from '../src/lib/config.js';
import holidays from '../data/holidays.json' with { type: 'json' };
import gtxTimetable from '../data/gtx-a.json' with { type: 'json' };
import { sendTelegramMessage } from './telegram.mjs';
import { loadConfigFromEnv } from './config-env.mjs';

const POLL_INTERVAL_MINUTES = 5; // .github/workflows/reminder.yml의 cron 간격과 반드시 맞춘다.

async function main() {
  const config = loadConfigFromEnv();
  const now = new Date();

  const gate = isBusinessDay(now, holidays, config.businessDay.overrides);
  if (!gate.business || gate.mode === 'REMOTE') {
    console.log(`skip: ${gate.business ? gate.mode : gate.reason}`);
    process.exit(0);
  }

  if (!Array.isArray(gtxTimetable) || gtxTimetable.length === 0) {
    console.log('skip: GTX-A 시간표 없음');
    process.exit(0);
  }

  const busLeg = config.legs.find((leg) => leg.type === 'bus');
  const busArrival = busLeg?.boardStopId
    ? await getBusArrival({ baseUrl: PROXY_BASE_URL, stopId: busLeg.boardStopId, routes: busLeg.routes })
    : [];

  const verdict = plan({ now, timetable: gtxTimetable, busArrival, weather: {}, config });
  const countdownMinutes = Number(verdict.countdown.replace(/[^0-9]/g, '')) || 0;
  const reminderBefore = config.notify.leaveReminderBefore;

  const inReminderWindow =
    verdict.countdown !== '지금 출발' &&
    countdownMinutes <= reminderBefore &&
    countdownMinutes > reminderBefore - POLL_INTERVAL_MINUTES;

  if (!inReminderWindow) {
    console.log(`skip: countdown=${verdict.countdown} (리마인더 구간 아님)`);
    process.exit(0);
  }

  await sendTelegramMessage(
    `⏰ 곧 출발 — ${verdict.countdown} (${verdict.leaveAt})\n${verdict.reasons.join(' · ')}`,
  );
  console.log('리마인더 전송 완료');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
