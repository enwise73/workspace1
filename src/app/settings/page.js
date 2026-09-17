"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { loadConfig, saveConfig } from "@/lib/config";
import { toKst } from "@/lib/time";

const LEG_ROWS = [
  { id: "d1", label: "d1 집 → 역 도보" },
  { id: "d2", label: "d2 개찰 → 승강장" },
  { id: "d3", label: "d3 하차역 환승 도보" },
  { id: "d4", label: "d4 정류장 → 회사 도보" },
];

const OVERRIDE_MODE_LABEL = { VACATION: "휴가", REMOTE: "재택", WORK: "특별근무" };
const OVERRIDE_DAY_CLASS = { VACATION: "dayVacation", REMOTE: "dayRemote", WORK: "dayToday" };

const WEEKDAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"];

function findLeg(config, id) {
  return config.legs.find((leg) => leg.id === id);
}

function withLegMinutes(config, id, minutes) {
  return { ...config, legs: config.legs.map((leg) => (leg.id === id ? { ...leg, minutes } : leg)) };
}

function withBusField(config, field, value) {
  return { ...config, legs: config.legs.map((leg) => (leg.type === "bus" ? { ...leg, [field]: value } : leg)) };
}

// 아래 6개는 화면 타임라인에 찍히는 "이름표"다. 계산(분)에는 영향 없다.
// 역 이름 하나가 d1의 도착지·d2가 있는 곳·GTX 승차역 이름, 세 군데에 동시에 쓰이는 게 자연스러워서
// 한 입력칸으로 세 군데를 같이 채운다 — 안 그러면 같은 역 이름을 세 번 따로 입력해야 한다.
function withOriginStation(config, name) {
  return {
    ...config,
    legs: config.legs.map((leg) => {
      if (leg.id === "d1") return { ...leg, to: name };
      if (leg.id === "d2") return { ...leg, at: name };
      if (leg.type === "rail") return { ...leg, from: name };
      return leg;
    }),
  };
}

function withRailLine(config, line) {
  return { ...config, legs: config.legs.map((leg) => (leg.type === "rail" ? { ...leg, line } : leg)) };
}

function withDestStation(config, name) {
  return {
    ...config,
    legs: config.legs.map((leg) => {
      if (leg.type === "rail") return { ...leg, to: name };
      if (leg.id === "d3") return { ...leg, from: name };
      return leg;
    }),
  };
}

function withBoardStopName(config, name) {
  return { ...config, legs: config.legs.map((leg) => (leg.id === "d3" ? { ...leg, to: name } : leg)) };
}

function withAlightStopName(config, name) {
  return { ...config, legs: config.legs.map((leg) => (leg.id === "d4" ? { ...leg, from: name } : leg)) };
}

function withOfficeName(config, name) {
  return { ...config, legs: config.legs.map((leg) => (leg.id === "d4" ? { ...leg, to: name } : leg)) };
}

// 캘린더 격자는 타임존 이슈를 피하려고 UTC 기준 날짜 계산으로 만든다 — 어차피 "몇 번째 요일"만 필요하다.
function buildMonthGrid(year, month) {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array(firstWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function SettingsPage() {
  const [config, setConfig] = useState(null);
  const [newOverrideDate, setNewOverrideDate] = useState("");
  const [newOverrideMode, setNewOverrideMode] = useState("VACATION");
  // 노선 목록 입력칸은 "타이핑 중인 원문"을 따로 들고 있는다. config.routes(배열)에서 매번
  // 다시 join해서 value로 쓰면, 콤마를 막 입력한 직후("103,")의 뒤 콤마가 filter(Boolean)에
  // 걸러지면서 그 자리에서 "103"으로 되돌아가 콤마를 칠 수 없게 된다.
  const [routesText, setRoutesText] = useState("");
  const [copyStatus, setCopyStatus] = useState(null);

  useEffect(() => {
    // localStorage는 서버(빌드 타임)에 없어 마운트 후에만 읽을 수 있다 — 하이드레이션 불일치를 피하려고
    // 일부러 첫 렌더는 기본값으로 두고, 마운트 이후에 실제 설정으로 갱신한다.
    const loaded = loadConfig();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(loaded);
    setRoutesText(loaded.legs.find((leg) => leg.type === "bus")?.routes.join(",") ?? "");
  }, []);

  useEffect(() => {
    if (config) saveConfig(config);
  }, [config]);

  if (!config) {
    return <div className={styles.page} />;
  }

  const busLeg = config.legs.find((leg) => leg.type === "bus");
  const today = toKst(new Date());
  const [year, month] = today.dateKey.split("-").map(Number);
  const monthGrid = buildMonthGrid(year, month - 1);
  const overrideByDate = Object.fromEntries(config.businessDay.overrides.map((item) => [item.date, item.mode]));

  const addOverride = () => {
    if (!newOverrideDate) return;
    const next = config.businessDay.overrides.filter((item) => item.date !== newOverrideDate);
    next.push({ date: newOverrideDate, mode: newOverrideMode });
    next.sort((a, b) => a.date.localeCompare(b.date));
    setConfig({ ...config, businessDay: { ...config.businessDay, overrides: next } });
    setNewOverrideDate("");
  };

  const removeOverride = (date) => {
    setConfig({
      ...config,
      businessDay: {
        ...config.businessDay,
        overrides: config.businessDay.overrides.filter((item) => item.date !== date),
      },
    });
  };

  const copyConfigToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(config));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    setTimeout(() => setCopyStatus(null), 3000);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link className={styles.back} href="/" aria-label="뒤로">
          ‹
        </Link>
        <div className={styles.title}>설정</div>
      </div>

      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.sectionLabel}>목표</div>
          <div className={styles.group}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>목표 도착시각</span>
              <input
                type="time"
                className={styles.timeInput}
                value={config.profile.targetArrival}
                onChange={(e) => setConfig({ ...config, profile: { targetArrival: e.target.value } })}
              />
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>구간 도보 · 버퍼 (분)</div>
          <div className={styles.group}>
            {LEG_ROWS.map((row) => {
              const leg = findLeg(config, row.id);
              return (
                <div key={row.id} className={styles.row}>
                  <span className={styles.rowLabel}>{row.label}</span>
                  <div className={styles.stepper}>
                    <button
                      type="button"
                      className={styles.stepperButton}
                      onClick={() => setConfig(withLegMinutes(config, row.id, Math.max(0, leg.minutes - 1)))}
                      aria-label={`${row.label} 줄이기`}
                    >
                      −
                    </button>
                    <span className={styles.stepperValue}>{leg.minutes}</span>
                    <button
                      type="button"
                      className={styles.stepperButton}
                      onClick={() => setConfig(withLegMinutes(config, row.id, leg.minutes + 1))}
                      aria-label={`${row.label} 늘리기`}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
            <div className={styles.row}>
              <span className={styles.rowLabel}>버퍼 철도 / 버스 / 최종</span>
              <span className={styles.rowValue}>
                {config.buffers.rail} · {config.buffers.busTransfer} · {config.buffers.final}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>구간 이름 (홈 화면 타임라인 표시용)</div>
          <div className={styles.group}>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>출발역 이름 (집에서 타는 역)</span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="예: 운정중앙역"
                value={findLeg(config, "d1").to}
                onChange={(e) => setConfig(withOriginStation(config, e.target.value))}
              />
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>노선명</span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="예: GTX-A"
                value={config.legs.find((leg) => leg.type === "rail").line}
                onChange={(e) => setConfig(withRailLine(config, e.target.value))}
              />
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>도착역 이름 (내려서 버스 갈아타는 역)</span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="예: 서울역"
                value={config.legs.find((leg) => leg.type === "rail").to}
                onChange={(e) => setConfig(withDestStation(config, e.target.value))}
              />
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>승차 정류장 이름</span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="예: 서울역 6번 승강장"
                value={findLeg(config, "d3").to}
                onChange={(e) => setConfig(withBoardStopName(config, e.target.value))}
              />
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>하차 정류장 이름</span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="예: 우리은행종로지점"
                value={findLeg(config, "d4").from}
                onChange={(e) => setConfig(withAlightStopName(config, e.target.value))}
              />
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>목적지(회사) 이름</span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="예: 교원빌딩"
                value={findLeg(config, "d4").to}
                onChange={(e) => setConfig(withOfficeName(config, e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>출근길 정류장 · 노선</div>
          <div className={styles.group}>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>승차 정류장ID</span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="예: 02006"
                value={busLeg.boardStopId}
                onChange={(e) => setConfig(withBusField(config, "boardStopId", e.target.value))}
              />
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>하차 정류장ID</span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="예: 02139"
                value={busLeg.alightStopId}
                onChange={(e) => setConfig(withBusField(config, "alightStopId", e.target.value))}
              />
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>노선 번호 (쉼표로 구분)</span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="예: 103,173,202,261,262,7017,7021"
                value={routesText}
                onChange={(e) => {
                  setRoutesText(e.target.value);
                  setConfig(
                    withBusField(
                      config,
                      "routes",
                      e.target.value.split(",").map((route) => route.trim()).filter(Boolean),
                    ),
                  );
                }}
              />
            </div>
          </div>
          <div className={styles.hint}>정류장ID는 아직 채워 넣지 않았다면 카카오맵/네이버맵에서 정류장을 탭해 확인하세요.</div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>기상청 격자좌표</div>
          <div className={styles.group}>
            {["origin", "destination"].map((key) => (
              <div key={key} className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{key === "origin" ? "출발지 (예: 집 근처)" : "도착지 (예: 회사 근처)"}</span>
                <div className={styles.exceptionForm}>
                  <input
                    type="number"
                    className={styles.numberInput}
                    aria-label="nx"
                    value={config.weather[key].nx}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        weather: { ...config.weather, [key]: { ...config.weather[key], nx: Number(e.target.value) } },
                      })
                    }
                  />
                  <input
                    type="number"
                    className={styles.numberInput}
                    aria-label="ny"
                    value={config.weather[key].ny}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        weather: { ...config.weather, [key]: { ...config.weather[key], ny: Number(e.target.value) } },
                      })
                    }
                  />
                </div>
              </div>
            ))}
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>미세먼지 측정소 이름 (에어코리아 기준, 예: 중구)</span>
              <input
                type="text"
                className={styles.textInput}
                placeholder="예: 중구"
                value={config.weather.airStation}
                onChange={(e) =>
                  setConfig({ ...config, weather: { ...config.weather, airStation: e.target.value } })
                }
              />
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>
            예외일 — {year}년 {month}월
          </div>
          <div className={styles.calendarCard}>
            <div className={styles.weekHeader}>
              {WEEKDAY_HEADERS.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className={styles.weekGrid}>
              {monthGrid.map((day, i) => {
                if (day === null) return <div key={i} />;
                const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const overrideMode = overrideByDate[dateKey];
                const isToday = dateKey === today.dateKey;
                const dayClass = overrideMode
                  ? styles[OVERRIDE_DAY_CLASS[overrideMode]]
                  : isToday
                    ? styles.dayToday
                    : styles.dayNormal;
                return (
                  <div key={i} className={`${styles.day} ${dayClass}`}>
                    {day}
                  </div>
                );
              })}
            </div>

            <div className={styles.exceptionForm}>
              <input
                type="date"
                className={styles.textInput}
                style={{ flex: 1 }}
                value={newOverrideDate}
                onChange={(e) => setNewOverrideDate(e.target.value)}
              />
              <select
                className={styles.exceptionSelect}
                value={newOverrideMode}
                onChange={(e) => setNewOverrideMode(e.target.value)}
              >
                <option value="VACATION">휴가</option>
                <option value="REMOTE">재택</option>
                <option value="WORK">특별근무</option>
              </select>
              <button type="button" className={styles.addButton} onClick={addOverride}>
                추가
              </button>
            </div>

            {config.businessDay.overrides.length > 0 ? (
              <div className={styles.exceptionList}>
                {config.businessDay.overrides.map((item) => (
                  <div key={item.date} className={styles.exceptionItem}>
                    <span>
                      {item.date} · {OVERRIDE_MODE_LABEL[item.mode] ?? item.mode}
                    </span>
                    <button type="button" className={styles.removeButton} onClick={() => removeOverride(item.date)}>
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>알림</div>
          <div className={styles.group}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>아침 브리핑</span>
              <input
                type="time"
                className={styles.timeInput}
                value={config.notify.briefingAt}
                onChange={(e) => setConfig({ ...config, notify: { ...config.notify, briefingAt: e.target.value } })}
              />
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>출발 리마인더</span>
              <div className={styles.stepper}>
                <input
                  type="number"
                  className={styles.numberInput}
                  min={0}
                  value={config.notify.leaveReminderBefore}
                  onChange={(e) =>
                    setConfig({ ...config, notify: { ...config.notify, leaveReminderBefore: Number(e.target.value) } })
                  }
                />
                <span className={styles.rowValue}>분 전</span>
              </div>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>비영업일 완전 침묵</span>
              <button
                type="button"
                className={`${styles.toggle} ${config.notify.silentOnNonBusinessDay ? styles.toggleOn : styles.toggleOff}`}
                aria-pressed={config.notify.silentOnNonBusinessDay}
                onClick={() =>
                  setConfig({
                    ...config,
                    notify: { ...config.notify, silentOnNonBusinessDay: !config.notify.silentOnNonBusinessDay },
                  })
                }
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>재택일 날씨만 발송</span>
              <button
                type="button"
                className={`${styles.toggle} ${config.businessDay.remoteDayBriefing ? styles.toggleOn : styles.toggleOff}`}
                aria-pressed={config.businessDay.remoteDayBriefing}
                onClick={() =>
                  setConfig({
                    ...config,
                    businessDay: { ...config.businessDay, remoteDayBriefing: !config.businessDay.remoteDayBriefing },
                  })
                }
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>설정 내보내기 (GitHub Actions용)</div>
          <div className={styles.hint}>
            GitHub Actions는 브라우저 localStorage를 못 읽어서, 아래 값을 복사해 저장소의{" "}
            <strong>Settings → Secrets and variables → Actions</strong>에{" "}
            <code>GONOW_CONFIG</code>라는 이름의 Secret으로 등록해야 알림이 동작합니다. 정류장ID 등
            개인 정보가 들어있으니 절대 코드나 채팅에 붙여넣지 말고 Secret에만 등록하세요.
          </div>
          <textarea
            className={styles.exportBox}
            readOnly
            value={JSON.stringify(config)}
            onFocus={(e) => e.target.select()}
          />
          <button type="button" className={styles.addButton} onClick={copyConfigToClipboard}>
            {copyStatus === "copied" ? "복사됨" : copyStatus === "failed" ? "복사 실패 — 직접 선택해서 복사하세요" : "클립보드에 복사"}
          </button>
        </div>
      </div>
    </div>
  );
}
