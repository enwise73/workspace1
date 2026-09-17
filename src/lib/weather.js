// 기상·대기질 해석 + 옷차림/우산 룰. 순수 함수 — DOM/fetch를 직접 호출하지 않는다 (CLAUDE.md §4).
// 기상청 원본 코드값(PTY 등)은 여기서 다루지 않는다 — sources.js가 이미 정규화해서 넘겨준다는
// 전제다 (예: PTY 코드 1 -> precipType: 'rain'). 이 파일은 "이미 정리된 숫자/문자열을 해석"만 한다.

const DUST_GRADE_TEXT = { 1: '좋음', 2: '보통', 3: '나쁨', 4: '매우나쁨' };
const DUST_MASK_THRESHOLD = 3; // '나쁨'부터 마스크 권장 (§12 함정 7 — '보통' 이하는 조건부 노출 생략)

const PRECIPITATING_TYPES = new Set(['rain', 'snow', 'mixed', 'shower']);
const SNOWY_TYPES = new Set(['snow', 'mixed']);

/**
 * 강수 판정 (F-13). "☔ 우산 필요 / 🌂 접이식 권장 / ☀️ 불필요" 3단 결론.
 * @param {{popPercent: number, precipType?: 'none'|'rain'|'snow'|'mixed'|'shower'}} input
 * @param {{needPop: number, foldablePop: number}} thresholds config.weather.umbrella
 * @returns {{level: 'NEED'|'FOLDABLE'|'NONE', text: string, isPrecipitating: boolean, isSnowing: boolean}}
 */
export function judgeUmbrella({ popPercent, precipType = 'none' }, thresholds) {
  const isPrecipitating = PRECIPITATING_TYPES.has(precipType);
  const isSnowing = SNOWY_TYPES.has(precipType);

  if (isPrecipitating || popPercent >= thresholds.needPop) {
    return { level: 'NEED', text: '우산 필요', isPrecipitating, isSnowing };
  }
  if (popPercent >= thresholds.foldablePop) {
    return { level: 'FOLDABLE', text: '접이식 권장', isPrecipitating, isSnowing };
  }
  return { level: 'NONE', text: '불필요', isPrecipitating, isSnowing };
}

/**
 * 체감온도 계산.
 * - 겨울철(기온 10도 이하, 풍속 4.8km/h 이상): 기상청 공식 체감온도(풍속냉각) 식.
 * - 여름철(기온 27도 이상): NOAA Heat Index 근사식 사용 — 기상청 공식 여름철 체감온도식과
 *   완전히 같지는 않다(계수 비공개/암기 불확실). 정확한 값이 필요하면 기상청 API가 체감온도를
 *   직접 내려줄 때 그 값으로 교체한다. 그 전까지는 근사값임을 reasons 등에서 숨기지 않는다.
 * - 그 외 구간은 실제 기온을 그대로 쓴다.
 * @param {{tempC: number, humidityPct: number, windSpeedMs: number}} input
 * @returns {{feelsLikeC: number, isApproximate: boolean}}
 */
export function computeFeelsLike({ tempC, humidityPct, windSpeedMs }) {
  const windKmh = windSpeedMs * 3.6;

  if (tempC <= 10 && windKmh >= 4.8) {
    const windFactor = windKmh ** 0.16;
    const feelsLikeC = 13.12 + 0.6215 * tempC - 11.37 * windFactor + 0.3965 * tempC * windFactor;
    return { feelsLikeC: Math.round(feelsLikeC * 10) / 10, isApproximate: false };
  }

  if (tempC >= 27 && typeof humidityPct === 'number') {
    const tempF = tempC * 1.8 + 32;
    const heatIndexF =
      -42.379 +
      2.04901523 * tempF +
      10.14333127 * humidityPct -
      0.22475541 * tempF * humidityPct -
      0.00683783 * tempF ** 2 -
      0.05481717 * humidityPct ** 2 +
      0.00122874 * tempF ** 2 * humidityPct +
      0.00085282 * tempF * humidityPct ** 2 -
      0.00000199 * tempF ** 2 * humidityPct ** 2;
    const feelsLikeC = (heatIndexF - 32) / 1.8;
    return { feelsLikeC: Math.round(feelsLikeC * 10) / 10, isApproximate: true };
  }

  return { feelsLikeC: tempC, isApproximate: false };
}

/**
 * 옷차림 추천 (F-14). PRD §8 규칙대로 "min(현재기온, 퇴근시각 기온)"을 기준으로 삼는다.
 * (체감온도 기준으로 바꿀지는 아직 결정되지 않았다 — PRD.md §14 참고.)
 * @param {{currentTempC: number, eveningTempC: number}} input
 * @param {{min: number, text: string}[]} wardrobeTable min 내림차순으로 정렬돼 있다고 가정한다
 * @returns {string}
 */
export function pickWardrobe({ currentTempC, eveningTempC }, wardrobeTable) {
  const baseTempC = Math.min(currentTempC, eveningTempC);
  const matched = wardrobeTable.find((row) => baseTempC >= row.min);
  return matched ? matched.text : wardrobeTable[wardrobeTable.length - 1].text;
}

/**
 * 미세먼지 등급 → 마스크 권장 여부 (F-15). PM10/PM2.5 중 더 나쁜 등급을 기준으로 삼는다.
 * @param {{pm10Grade: number, pm25Grade: number}} input 1(좋음)~4(매우나쁨)
 * @returns {{grade: number, text: string, needMask: boolean}}
 */
export function judgeDust({ pm10Grade, pm25Grade }) {
  const grade = Math.max(pm10Grade, pm25Grade);
  return {
    grade,
    text: DUST_GRADE_TEXT[grade] ?? '알 수 없음',
    needMask: grade >= DUST_MASK_THRESHOLD,
  };
}
