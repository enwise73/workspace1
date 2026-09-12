"use client";

import { useState } from "react";
import styles from "./page.module.css";
import VerdictCard from "@/components/VerdictCard";

// 초안: 실제 계산 전 하드코딩한 예시 데이터. planner.js/businessday.js/weather.js가
// 생기면 이 자리에 그 결과(verdict, weather, gate)를 그대로 꽂아 넣는다.
const SAMPLE = {
  GO: {
    date: "9월 14일",
    day: "(월)",
    context: "이번 주 1번째 영업일",
    weather: { now: "18°", minMax: "15 / 24", rain: "70%", dust: "나쁨" },
    verdict: {
      level: "GO",
      headline: "지금 출발",
      detail: (
        <>
          08:38 도착 · 목표 08:50 · <strong>여유 12분</strong>
        </>
      ),
      window: "출발 창 07:35 — 07:41",
    },
    prep: [
      { type: "rain", label: "준비물", value: "우산 챙기세요" },
      { type: "plain", label: "옷차림 · 퇴근 18시 13°", value: "얇은 니트 · 가디건" },
    ],
    legs: [
      { time: "07:38", label: "집 → 운정중앙역 도보", duration: "12분", dotActive: true },
      { time: "07:52", label: "GTX-A 서울역 방면", duration: "22분" },
      { time: "08:14", label: "서울역 환승 도보", duration: "7분" },
      { time: "08:22", label: "405번 버스", live: "실시간 3분 뒤", duration: "11분" },
      { time: "08:34", label: "명동 정류장 → 교원빌딩", duration: "4분" },
      { time: "08:38", label: "교원빌딩 도착", duration: "+12분", arrive: true },
    ],
    note: {
      text: "비 예보로 도보 구간 +3분 반영 · GTX 07:52편 기준",
      lines: ["다음 GTX 07:52 / 07:58 / 08:05", "정류장 405 (3분) · 402 (9분)"],
    },
    refresh: "3초 전",
    primaryAction: "오늘 쉬기",
  },
  WAIT: {
    date: "9월 14일",
    day: "(월)",
    context: "이번 주 1번째 영업일",
    weather: { now: "18°", minMax: "15 / 24", rain: "70%", dust: "나쁨" },
    alert: {
      title: "GTX-A 상행 지연 추정 +6분",
      body: "서울역 1·4호선 실시간 지표로 간접 감지 · 시간표 기준값 보정",
    },
    verdict: {
      level: "WAIT",
      headline: "7분 뒤 출발",
      detail: (
        <>
          07:32 출발 · 08:44 도착 · <strong>여유 6분</strong>
        </>
      ),
      window: "출발 창 07:30 — 07:35",
    },
    altRoutes: [
      { title: "경의중앙선", detail: "도착 08:57 · +13분" },
      { title: "서울역→명동 도보", detail: "비 예보로 제외" },
    ],
    legs: [
      { time: "07:32", label: "집 → 운정중앙역 도보", duration: "12분" },
      { time: "07:52", label: "GTX-A", tag: "지연 +6분", duration: "28분", delay: true },
      { time: "08:20", label: "서울역 환승 도보", duration: "7분" },
      { time: "08:29", label: "405번 버스", duration: "11분" },
      { time: "08:44", label: "교원빌딩 도착", duration: "+6분", arrive: true, delay: true },
    ],
    note: { text: "버스 정보 없음 — 시간표 기준 추정 (실패를 숨기지 않습니다)" },
    refresh: "방금",
    primaryAction: "지연 수동 입력",
  },
};

const OFF_DAY = {
  date: "9월 13일 (일)",
  title: "오늘은 쉬는 날",
  nextBusinessDay: "9/14 (월)",
  pill: "알림 침묵 · 주말",
  weather: { label: "운정 · 오늘", desc: "맑음 · 강수 10%", temp: "21°", minMax: "15/26" },
};

export default function Home() {
  // "GO" | "WAIT" | "OFF_DAY" — 실제로는 businessday.js + planner.js가 정하는 값이다.
  const [view, setView] = useState("GO");

  return (
    <div className={styles.page}>
      <div className={styles.previewBar}>
        {["GO", "WAIT", "OFF_DAY"].map((key) => (
          <button
            key={key}
            type="button"
            className={`${styles.previewButton} ${view === key ? styles.previewButtonActive : ""}`}
            onClick={() => setView(key)}
          >
            미리보기 · {key}
          </button>
        ))}
      </div>

      {view === "OFF_DAY" ? (
        <OffDayView onGoBusinessDay={() => setView("GO")} />
      ) : (
        <BusinessDayView data={SAMPLE[view]} onTakeDayOff={() => setView("OFF_DAY")} />
      )}
    </div>
  );
}

function BusinessDayView({ data, onTakeDayOff }) {
  return (
    <>
      <div className={styles.dateHeader}>
        <div className={styles.dateRow}>
          <div className={styles.dateText}>
            {data.date} <span className={styles.dateSub}>{data.day}</span>
          </div>
          <div className={styles.badge}>{data.context}</div>
        </div>
        <div className={styles.weatherGrid}>
          <WeatherCell label="지금" value={data.weather.now} />
          <WeatherCell label="최저 / 최고" value={data.weather.minMax} />
          <WeatherCell label="강수" value={data.weather.rain} tone="rain" />
          <WeatherCell label="미세먼지" value={data.weather.dust} tone="dust" />
        </div>
      </div>

      {data.alert ? (
        <div className={styles.alertBanner}>
          <div className={styles.alertIcon}>!</div>
          <div>
            <div className={styles.alertTitle}>{data.alert.title}</div>
            <div className={styles.alertBody}>{data.alert.body}</div>
          </div>
        </div>
      ) : null}

      <VerdictCard
        level={data.verdict.level}
        headline={data.verdict.headline}
        detail={data.verdict.detail}
        window={data.verdict.window}
      />

      {data.prep ? (
        <div className={styles.prepRow}>
          {data.prep.map((item) => (
            <div
              key={item.label}
              className={`${styles.prepCard} ${item.type === "rain" ? styles.prepCardRain : styles.prepCardPlain}`}
            >
              <div className={styles.prepLabel}>{item.label}</div>
              <div className={styles.prepValue}>{item.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {data.altRoutes ? (
        <div className={styles.altRow}>
          <div className={styles.altLabel}>대안 경로</div>
          <div className={styles.altCards}>
            {data.altRoutes.map((route) => (
              <div key={route.title} className={styles.altCard}>
                <div className={styles.altCardTitle}>{route.title}</div>
                <div className={styles.altCardDetail}>{route.detail}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.timeline}>
        {data.legs.map((leg) => (
          <div key={leg.time + leg.label} className={styles.legRow}>
            <div
              className={`${styles.legTime} ${leg.arrive ? styles.legTimeArrive : ""} ${leg.delay ? styles.legTimeDelay : ""}`}
            >
              {leg.time}
            </div>
            <div className={`${styles.legDot} ${leg.dotActive ? styles.legDotActive : ""}`} />
            <div className={styles.legBody}>
              <span className={`${styles.legLabel} ${leg.arrive ? styles.legLabelArrive : ""}`}>
                {leg.label} {leg.tag ? <span className={styles.legTimeDelay}>{leg.tag}</span> : null}
                {leg.live ? <span className={styles.legLive}> {leg.live}</span> : null}
              </span>
              <span
                className={`${styles.legDuration} ${leg.arrive ? styles.legDurationArrive : ""} ${leg.delay ? styles.legDurationDelay : ""}`}
              >
                {leg.duration}
              </span>
            </div>
          </div>
        ))}

        {data.note ? (
          <div className={styles.noteBox}>
            <div className={styles.noteText}>{data.note.text}</div>
            {data.note.lines?.map((line) => (
              <div key={line} className={styles.noteMono}>
                {line}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.bottomBar}>
        <a className={styles.barButton} href="/settings">
          설정
        </a>
        <button type="button" className={styles.barButtonPrimary} onClick={onTakeDayOff}>
          {data.primaryAction}
        </button>
        <div className={styles.refreshNote}>갱신
          <br />
          {data.refresh}
        </div>
      </div>
    </>
  );
}

function OffDayView({ onGoBusinessDay }) {
  return (
    <>
      <div className={styles.offDay}>
        <div className={styles.offDate}>{OFF_DAY.date}</div>
        <div className={styles.offTitle}>{OFF_DAY.title}</div>
        <div className={styles.offNext}>
          다음 영업일 <strong>{OFF_DAY.nextBusinessDay}</strong>
        </div>
        <div className={styles.offPill}>{OFF_DAY.pill}</div>
        <div className={styles.offWeatherCard}>
          <div className={styles.offWeatherLeft}>
            <div className={styles.offWeatherLabel}>{OFF_DAY.weather.label}</div>
            <div className={styles.offWeatherDesc}>{OFF_DAY.weather.desc}</div>
          </div>
          <div className={styles.offWeatherTemp}>
            {OFF_DAY.weather.temp}
            <span>{OFF_DAY.weather.minMax}</span>
          </div>
        </div>
      </div>
      <div className={styles.offActions}>
        <button type="button" className={styles.offPrimary}>
          그래도 교통 정보 보기
        </button>
        <button type="button" className={styles.offSecondary} onClick={onGoBusinessDay}>
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
