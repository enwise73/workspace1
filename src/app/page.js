"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import VerdictCard from "@/components/VerdictCard";
import { loadConfig, PROXY_BASE_URL } from "@/lib/config";
import { isBusinessDay } from "@/lib/businessday";
import { plan } from "@/lib/planner";
import { judgeUmbrella, computeFeelsLike, pickWardrobe, judgeDust } from "@/lib/weather";
import { getCurrentWeather, getForecastWeather, getDustGrade, getBusArrival } from "@/lib/sources";
import { toKst, toDateLabel } from "@/lib/time";
import gtxTimetable from "../../data/gtx-a.json";
import holidays from "../../data/holidays.json";

function dateLabel(now) {
  const label = toDateLabel(now);
  return { dateKey: label.dateKey, text: `${label.month}월 ${label.day}일`, day: `(${label.weekdayKo})`, month: label.month, dayOfMonth: label.day };
}

function findNextBusinessDate(from, holidays, overrides) {
  const cursor = new Date(from);
  for (let i = 0; i < 14; i += 1) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor, holidays, overrides).business) return cursor;
  }
  return null;
}

async function fetchWeatherBundle(config) {
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
  return { current, forecast, dust };
}

function resolvePrecipType(current, forecast) {
  if (current && current.precipType !== "none") return current.precipType;
  return forecast?.precipType ?? "none";
}

export default function Home() {
  const [config, setConfig] = useState(null);
  const [view, setView] = useState({ status: "loading" });
  const [peek, setPeek] = useState(false); // "그래도 교통 정보 보기" — 비영업일에도 조회는 허용한다 (§5)

  useEffect(() => {
    // localStorage는 서버(빌드 타임)에 없어 마운트 후에만 읽을 수 있다 — 하이드레이션 불일치를 피하려고
    // 일부러 첫 렌더는 기본값으로 두고, 마운트 이후에 실제 설정으로 갱신한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(loadConfig());
  }, []);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;

    (async () => {
      const now = new Date();
      // 공휴일은 매번 API를 부르지 않고 커밋된 캐시(data/holidays.json)를 쓴다 — 월 1회
      // sync-holidays 워크플로가 갱신한다 (§12 함정 6, PRD §6.2 결정4).
      const gate = isBusinessDay(now, holidays, config.businessDay.overrides);
      const effectiveBusiness = gate.business || peek;

      if (!effectiveBusiness) {
        const nextDate = findNextBusinessDate(now, holidays, config.businessDay.overrides);
        const { current, forecast } = await fetchWeatherBundle(config);
        if (!cancelled) setView({ status: "OFF_DAY", gate, nextDate, current, forecast });
        return;
      }

      const { current, forecast, dust } = await fetchWeatherBundle(config);
      const effectiveMode = gate.business ? gate.mode : "WORK"; // peek 중엔 교통 정보를 본다

      if (effectiveMode === "REMOTE") {
        if (!cancelled) setView({ status: "REMOTE", gate, current, forecast, dust });
        return;
      }

      const busLeg = config.legs.find((leg) => leg.type === "bus");
      const busArrival = busLeg?.boardStopId
        ? await getBusArrival({ baseUrl: PROXY_BASE_URL, stopId: busLeg.boardStopId, routes: busLeg.routes })
        : [];

      if (!cancelled) setView({ status: "WORK", gate, current, forecast, dust, busArrival, now });
    })();

    return () => {
      cancelled = true;
    };
  }, [config, peek]);

  const takeDayOff = () => {
    const { dateKey } = toKst(new Date());
    const overrides = config.businessDay.overrides.filter((item) => item.date !== dateKey);
    overrides.push({ date: dateKey, mode: "VACATION" });
    setConfig({ ...config, businessDay: { ...config.businessDay, overrides } });
    setPeek(false);
  };

  const goToWorkToday = () => {
    const { dateKey } = toKst(new Date());
    const overrides = config.businessDay.overrides.filter((item) => item.date !== dateKey);
    overrides.push({ date: dateKey, mode: "WORK" });
    setConfig({ ...config, businessDay: { ...config.businessDay, overrides } });
  };

  if (!config || view.status === "loading") {
    return <div className={styles.page} />;
  }

  if (view.status === "OFF_DAY") {
    return <OffDayView view={view} onGoToWork={goToWorkToday} onPeek={() => setPeek(true)} />;
  }

  return <ActiveDayView view={view} config={config} onTakeDayOff={takeDayOff} />;
}

function ActiveDayView({ view, config, onTakeDayOff }) {
  const { current, forecast, dust } = view;
  const info = dateLabel(view.now ?? new Date());

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

  const weatherHeader = (
    <div className={styles.dateHeader}>
      <div className={styles.dateRow}>
        <div className={styles.dateText}>
          {info.text} <span className={styles.dateSub}>{info.day}</span>
        </div>
        {view.status === "REMOTE" ? <div className={styles.badge}>재택근무</div> : null}
      </div>
      <div className={styles.weatherGrid}>
        <WeatherCell label="지금" value={current ? `${Math.round(current.tempC)}°` : "정보 없음"} />
        <WeatherCell
          label="최저 / 최고"
          value={forecast ? `${forecast.minTempC ?? "-"} / ${forecast.maxTempC ?? "-"}` : "정보 없음"}
        />
        <WeatherCell label="강수" value={forecast ? `${forecast.popPercent}%` : "-"} tone="rain" />
        <WeatherCell label="미세먼지" value={dustInfo ? dustInfo.text : "정보 없음"} tone="dust" />
      </div>
    </div>
  );

  const prepRow = (
    <div className={styles.prepRow}>
      <div className={`${styles.prepCard} ${styles.prepCardRain}`}>
        <div className={styles.prepLabel}>준비물</div>
        <div className={styles.prepValue}>{umbrella.text}</div>
      </div>
      <div className={`${styles.prepCard} ${styles.prepCardPlain}`}>
        <div className={styles.prepLabel}>옷차림 · 퇴근 {config.weather.eveningHour}시</div>
        <div className={styles.prepValue}>{wardrobeText ?? "정보 없음"}</div>
      </div>
    </div>
  );

  if (view.status === "REMOTE") {
    return (
      <div className={styles.page}>
        {weatherHeader}
        {prepRow}
      </div>
    );
  }

  const hasTimetable = Array.isArray(gtxTimetable) && gtxTimetable.length > 0;
  const weatherInput = {
    isRaining: precipType === "rain" || precipType === "shower",
    isSnowing: precipType === "snow" || precipType === "mixed",
    popPercent: forecast?.popPercent ?? 0,
    feelsLike: feelsLike?.feelsLikeC,
  };
  const verdict = hasTimetable
    ? plan({ now: view.now ?? new Date(), timetable: gtxTimetable, busArrival: view.busArrival, weather: weatherInput, config })
    : null;

  return (
    <div className={styles.page}>
      {weatherHeader}
      {prepRow}

      {verdict ? (
        <>
          <VerdictCard
            level={verdict.status}
            headline={verdict.status === "GO" ? "지금 출발" : verdict.status === "WAIT" ? `${verdict.countdown} 출발` : "출발 시각 지남"}
            detail={
              verdict.arriveAt ? (
                <>
                  {verdict.arriveAt} 도착 · 목표 {config.profile.targetArrival} ·{" "}
                  <strong>{verdict.slack >= 0 ? `여유 ${verdict.slack}분` : `지각 ${-verdict.slack}분`}</strong>
                </>
              ) : (
                "계산 불가"
              )
            }
            window={verdict.window[0] === verdict.window[1] ? `출발 ${verdict.window[0]}` : `출발 창 ${verdict.window[0]} — ${verdict.window[1]}`}
          />
          <div className={styles.timeline}>
            {verdict.plan.map((leg) => (
              <div key={leg.time + leg.label} className={styles.legRow}>
                <div className={`${styles.legTime} ${leg.arrive ? styles.legTimeArrive : ""}`}>{leg.time}</div>
                <div className={styles.legDot} />
                <div className={styles.legBody}>
                  <span className={`${styles.legLabel} ${leg.arrive ? styles.legLabelArrive : ""}`}>
                    {leg.label}
                    {leg.live ? <span className={styles.legLive}> {leg.live}</span> : null}
                  </span>
                  <span className={`${styles.legDuration} ${leg.arrive ? styles.legDurationArrive : ""}`}>{leg.duration}</span>
                </div>
              </div>
            ))}
            {verdict.reasons?.length ? (
              <div className={styles.noteBox}>
                {verdict.reasons.map((reason) => (
                  <div key={reason} className={styles.noteText}>
                    {reason}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className={styles.timeline}>
          <div className={styles.noteBox}>
            <div className={styles.noteText}>
              GTX-A 시간표가 아직 등록되지 않아 출발 시각을 계산할 수 없습니다. `data/gtx-a.json`에 실제 시간표를 넣어주세요.
            </div>
            {view.busArrival?.length ? (
              <div className={styles.noteMono}>
                다음 버스: {view.busArrival.map((bus) => `${bus.route}번 ${bus.minutes}분`).join(" · ")}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className={styles.bottomBar}>
        <Link className={styles.barButton} href="/settings">
          설정
        </Link>
        <button type="button" className={styles.barButtonPrimary} onClick={onTakeDayOff}>
          오늘 쉬기
        </button>
      </div>
    </div>
  );
}

function OffDayView({ view, onGoToWork, onPeek }) {
  const { current, forecast, nextDate } = view;
  const info = dateLabel(new Date());
  const nextInfo = nextDate ? dateLabel(nextDate) : null;

  return (
    <>
      <div className={styles.offDay}>
        <div className={styles.offDate}>
          {info.text} {info.day}
        </div>
        <div className={styles.offTitle}>오늘은 쉬는 날</div>
        {nextInfo ? (
          <div className={styles.offNext}>
            다음 영업일 <strong>{nextInfo.month}/{nextInfo.dayOfMonth} {nextInfo.day}</strong>
          </div>
        ) : null}
        <div className={styles.offPill}>알림 침묵 · {view.gate.reason}</div>
        <div className={styles.offWeatherCard}>
          <div className={styles.offWeatherLeft}>
            <div className={styles.offWeatherLabel}>오늘 날씨</div>
            <div className={styles.offWeatherDesc}>{forecast?.popPercent ? `강수 ${forecast.popPercent}%` : "정보 없음"}</div>
          </div>
          <div className={styles.offWeatherTemp}>
            {current ? `${Math.round(current.tempC)}°` : "-"}
            <span>{forecast ? `${forecast.minTempC ?? "-"}/${forecast.maxTempC ?? "-"}` : ""}</span>
          </div>
        </div>
      </div>
      <div className={styles.offActions}>
        <button type="button" className={styles.offPrimary} onClick={onPeek}>
          그래도 교통 정보 보기
        </button>
        <button type="button" className={styles.offSecondary} onClick={onGoToWork}>
          오늘 근무로 바꾸기
        </button>
      </div>
    </>
  );
}

function WeatherCell({ label, value, tone }) {
  const toneClass = tone === "rain" ? styles.weatherValueRain : tone === "dust" ? styles.weatherValueDust : "";
  return (
    <div className={styles.weatherCell}>
      <div className={styles.weatherLabel}>{label}</div>
      <div className={`${styles.weatherValue} ${toneClass}`}>{value}</div>
    </div>
  );
}
