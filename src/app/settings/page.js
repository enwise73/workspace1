"use client";

import { useState } from "react";
import styles from "./page.module.css";

// 초안: 화면 모양만 우선 맞춘다. localStorage 저장/실제 값 검증(§14 확정되지 않은 것)은 이후 작업.
const LEG_ROWS = [
  { key: "d1", label: "d1 집 → 운정중앙역" },
  { key: "d2", label: "d2 개찰 → 승강장" },
  { key: "d3", label: "d3 서울역 환승" },
  { key: "d4", label: "d4 정류장 → 교원빌딩" },
];

const CALENDAR_WEEKS = [
  [null, null, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10, 11, 12],
  [13, 14, 15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24, 25, 26],
  [27, 28, 29, 30, null, null, null],
];

const DAY_MARK = {
  14: "today",
  18: "vacation",
  23: "remote",
};

const DAY_CLASS = {
  today: styles.dayToday,
  vacation: styles.dayVacation,
  remote: styles.dayRemote,
};

export default function SettingsPage() {
  const [legMinutes, setLegMinutes] = useState({ d1: 12, d2: 3, d3: 7, d4: 4 });
  const [silentOnOff, setSilentOnOff] = useState(true);
  const [remoteWeatherOnly, setRemoteWeatherOnly] = useState(false);

  const adjustLeg = (key, delta) => {
    setLegMinutes((prev) => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <a className={styles.back} href="/" aria-label="뒤로">
          ‹
        </a>
        <div className={styles.title}>설정</div>
      </div>

      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.sectionLabel}>목표</div>
          <div className={styles.group}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>목표 도착시각</span>
              <span className={styles.rowValueAccent}>08:50</span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>구간 도보 · 버퍼 (분)</div>
          <div className={styles.group}>
            {LEG_ROWS.map((row) => (
              <div key={row.key} className={styles.row}>
                <span className={styles.rowLabel}>{row.label}</span>
                <div className={styles.stepper}>
                  <button
                    type="button"
                    className={styles.stepperButton}
                    onClick={() => adjustLeg(row.key, -1)}
                    aria-label={`${row.label} 줄이기`}
                  >
                    −
                  </button>
                  <span className={styles.stepperValue}>{legMinutes[row.key]}</span>
                  <button
                    type="button"
                    className={styles.stepperButton}
                    onClick={() => adjustLeg(row.key, 1)}
                    aria-label={`${row.label} 늘리기`}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
            <div className={styles.row}>
              <span className={styles.rowLabel}>버퍼 철도 / 버스 / 최종</span>
              <span className={styles.rowValue}>2 · 3 · 5</span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>예외일 — 2026년 9월</div>
          <div className={styles.calendarCard}>
            <div className={styles.weekHeader}>
              {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className={styles.weekGrid}>
              {CALENDAR_WEEKS.flat().map((day, i) => {
                if (day === null) return <div key={i} />;
                const mark = DAY_MARK[day];
                return (
                  <div key={i} className={`${styles.day} ${mark ? DAY_CLASS[mark] : styles.dayNormal}`}>
                    {day}
                  </div>
                );
              })}
            </div>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: "var(--color-go)" }} />
                오늘/영업일
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: "var(--color-wait)" }} />
                휴가 9/18
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: "var(--color-rain)" }} />
                재택 9/23
              </span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>알림</div>
          <div className={styles.group}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>아침 브리핑</span>
              <span className={styles.rowValue}>07:05</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>출발 리마인더</span>
              <span className={styles.rowValue}>5분 전</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>비영업일 완전 침묵</span>
              <button
                type="button"
                className={`${styles.toggle} ${silentOnOff ? styles.toggleOn : styles.toggleOff}`}
                aria-pressed={silentOnOff}
                onClick={() => setSilentOnOff((v) => !v)}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>재택일 날씨만 발송</span>
              <button
                type="button"
                className={`${styles.toggle} ${remoteWeatherOnly ? styles.toggleOn : styles.toggleOff}`}
                aria-pressed={remoteWeatherOnly}
                onClick={() => setRemoteWeatherOnly((v) => !v)}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
