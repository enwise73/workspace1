// 영업일 아침 브리핑. .github/workflows/briefing.yml이 매일 아침 실행한다.
// 첫 스텝이 영업일 게이트다 — 비영업일이면 조용히 종료한다(§5, §6.4 의사코드 그대로).
// 실행: node scripts/briefing.mjs

import { pathToFileURL } from 'node:url';
import { isBusinessDay } from '../src/lib/businessday.js';
import { plan } from '../src/lib/planner.js';
import { judgeUmbrella, computeFeelsLike, pickWardrobe, judgeDust } from '../src/lib/weather.js';
import { getCurrentWeather, getForecastWeather, getDustGrade, getBusArrival } from '../src/lib/sources.js';
import { PROXY_BASE_URL } from '../src/lib/config.js';
import { toDateLabel } from '../src/lib/time.js';
import holidays from '../data/holidays.json' with { type: 'json' };
import gtxTimetable from '../data/gtx-a.json' with { type: 'json' };
import { sendTelegramMessage } from './telegram.mjs';
import { loadConfigFromEnv } from './config-env.mjs';

const LEG_ICON = { walk: '🚶', rail: '🚄', bus: '🚌' };

function resolvePrecipType(current, forecast) {
  if (current && current.precipType !== 'none') return current.precipType;
  return forecast?.precipType ?? 'none';
}

export async function buildMessage(config, now) {
  const dateInfo = toDateLabel(now);
  const gate = isBusinessDay(now, holidays, config.businessDay.overrides);

  const [current, forecast, dust] = await Promise.all([
    getCurrentWeather({ baseUrl: PROXY_BASE_URL, nx: config.weather.origin.nx, ny: config.weather.origin.ny }),
    getForecastWeather({
      baseUrl: PROXY_BASE_URL,
      nx: config.weather.origin.nx,
      ny: config.weather.origin.ny,
      eveningHour: config.weather.eveningHour,
    }),
    getDustGrade({ baseUrl: PROXY_BASE_URL, stationName: config.weather.airStation }),
  ]);

  const precipType = resolvePrecipType(current, forecast);
  const umbrella = judgeUmbrella({ popPercent: forecast?.popPercent ?? 0, precipType }, config.weather.umbrella);
  const feelsLike = current
    ? computeFeelsLike({ tempC: current.tempC, humidityPct: current.humidityPct, windSpeedMs: current.windSpeedMs })
    : null;
  const wardrobeText =
    current && forecast
      ? pickWardrobe({ currentTempC: current.tempC, eveningTempC: forecast.eveningTempC ?? current.tempC }, config.wardrobe)
      : null;
  const dustInfo = dust ? judgeDust(dust) : null;

  const lines = [`📅 ${dateInfo.text}${gate.mode === 'REMOTE' ? ' · 재택근무일' : ''}`];

  if (current) {
    const feelsLikeText = feelsLike ? ` · 체감 ${feelsLike.feelsLikeC}` : '';
    const minMaxText = forecast ? ` / 최저 ${forecast.minTempC ?? '-'} · 최고 ${forecast.maxTempC ?? '-'}` : '';
    lines.push(`🌡 현재 ${Math.round(current.tempC)}°C${minMaxText}${feelsLikeText}`);
  }
  // §8, §12 함정 8 — 조건부 노출. 우산 불필요/미세먼지 보통 이하는 아예 줄을 뺀다.
  if (umbrella.level !== 'NONE') {
    lines.push(`☔ 강수확률 ${forecast?.popPercent ?? 0}% — ${umbrella.text}`);
  }
  if (dustInfo?.needMask) {
    lines.push(`😷 미세먼지 '${dustInfo.text}' — 마스크 권장`);
  }
  if (wardrobeText) {
    lines.push(`👕 ${wardrobeText} (퇴근 ${config.weather.eveningHour}시 기준)`);
  }

  if (gate.mode !== 'REMOTE') {
    lines.push('─────────────');
    const busLeg = config.legs.find((leg) => leg.type === 'bus');
    const busArrival = busLeg?.boardStopId
      ? await getBusArrival({ baseUrl: PROXY_BASE_URL, stopId: busLeg.boardStopId, routes: busLeg.routes })
      : [];

    if (!Array.isArray(gtxTimetable) || gtxTimetable.length === 0) {
      lines.push('⚠️ GTX-A 시간표가 아직 등록되지 않아 출발 시각을 계산할 수 없습니다.');
    } else {
      const weatherInput = {
        isRaining: precipType === 'rain' || precipType === 'shower',
        isSnowing: precipType === 'snow' || precipType === 'mixed',
        popPercent: forecast?.popPercent ?? 0,
        feelsLike: feelsLike?.feelsLikeC,
      };
      const verdict = plan({ now, timetable: gtxTimetable, busArrival, weather: weatherInput, config });

      for (const leg of verdict.plan) {
        if (leg.mode === 'arrive') continue; // 도착은 아래 요약 줄 하나로 대신한다.
        const liveText = leg.live ? ` (${leg.live})` : '';
        lines.push(`${LEG_ICON[leg.mode] ?? '🚶'} ${leg.time} ${leg.label}${liveText}`);
      }
      const slackText = verdict.slack >= 0 ? `여유 ${verdict.slack}분` : `지각 예상 ${-verdict.slack}분`;
      lines.push(`🏢 ${verdict.arriveAt} 도착 (목표 ${config.profile.targetArrival} · ${slackText})`);
      if (verdict.reasons.length > 0) {
        lines.push(`ℹ️ ${verdict.reasons.join(' · ')}`);
      }
    }
  }

  // Actions cron은 정시 보장이 없다(§12 함정 2) — 실제 발송시각을 메시지에 남겨 지연 여부를 알 수 있게 한다(§8).
  const sentTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
  lines.push(`(발송 시각 ${sentTime})`);

  return { gate, text: lines.join('\n') };
}

async function main() {
  const config = loadConfigFromEnv();
  const now = new Date();

  const gateCheck = isBusinessDay(now, holidays, config.businessDay.overrides);
  if (!gateCheck.business) {
    console.log(`skip: ${gateCheck.reason}`);
    process.exit(0);
  }

  const { text } = await buildMessage(config, now);
  await sendTelegramMessage(text);
  console.log('브리핑 전송 완료');
}

// 직접 실행했을 때만 돈다 — 다른 스크립트나 테스트가 buildMessage만 부작용 없이 가져다 쓸 수 있게.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
