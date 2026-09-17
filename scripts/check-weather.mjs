// weather.js 고정 입력 검증 (CLAUDE.md §10). 테스트 프레임워크 없이 node 내장 assert만 쓴다.
// 실행: node scripts/check-weather.mjs

import assert from 'node:assert/strict';
import { judgeUmbrella, computeFeelsLike, pickWardrobe, judgeDust } from '../src/lib/weather.js';

const umbrellaThresholds = { needPop: 60, foldablePop: 30 };
const wardrobeTable = [
  { min: 28, text: '반팔·린넨' },
  { min: 23, text: '반팔·얇은 셔츠' },
  { min: 20, text: '긴팔·얇은 가디건' },
  { min: 17, text: '얇은 니트·맨투맨' },
  { min: 12, text: '자켓·가디건' },
  { min: 9, text: '트렌치코트·얇은 패딩' },
  { min: 5, text: '코트·히트텍' },
  { min: -99, text: '패딩·두꺼운 코트·목도리' },
];

let passed = 0;
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, `${label}\n  실제: ${JSON.stringify(actual)}\n  기대: ${JSON.stringify(expected)}`);
  passed += 1;
  console.log(`ok - ${label}`);
}

// 강수 판정 3단계
check(
  '비가 오는 중이면 강수확률과 무관하게 우산 필요',
  judgeUmbrella({ popPercent: 10, precipType: 'rain' }, umbrellaThresholds),
  { level: 'NEED', text: '우산 필요', isPrecipitating: true, isSnowing: false },
);
check(
  '강수확률 70%면 강수 중이 아니어도 우산 필요',
  judgeUmbrella({ popPercent: 70, precipType: 'none' }, umbrellaThresholds),
  { level: 'NEED', text: '우산 필요', isPrecipitating: false, isSnowing: false },
);
check(
  '강수확률 40%는 접이식 권장',
  judgeUmbrella({ popPercent: 40, precipType: 'none' }, umbrellaThresholds),
  { level: 'FOLDABLE', text: '접이식 권장', isPrecipitating: false, isSnowing: false },
);
check(
  '강수확률 10%는 불필요',
  judgeUmbrella({ popPercent: 10, precipType: 'none' }, umbrellaThresholds),
  { level: 'NONE', text: '불필요', isPrecipitating: false, isSnowing: false },
);
check(
  '눈이면 isSnowing이 true',
  judgeUmbrella({ popPercent: 80, precipType: 'snow' }, umbrellaThresholds).isSnowing,
  true,
);

// 체감온도 — 겨울철 풍속냉각
{
  const result = computeFeelsLike({ tempC: 0, humidityPct: 50, windSpeedMs: 5 });
  check('한겨울 강풍은 체감온도가 실제 기온보다 낮다', result.feelsLikeC < 0, true);
}
// 체감온도 — 무풍/실내 수준 바람이면 겨울이어도 보정하지 않는다
check(
  '기온 5도·무풍이면 체감온도 = 실제 기온',
  computeFeelsLike({ tempC: 5, humidityPct: 50, windSpeedMs: 0 }),
  { feelsLikeC: 5, isApproximate: false },
);
// 체감온도 — 봄가을 평범한 날은 보정 없음
check(
  '18도·습도 보통이면 체감온도 = 실제 기온',
  computeFeelsLike({ tempC: 18, humidityPct: 50, windSpeedMs: 3 }),
  { feelsLikeC: 18, isApproximate: false },
);
// 체감온도 — 한여름 고습도는 근사식 적용 표시
{
  const result = computeFeelsLike({ tempC: 33, humidityPct: 80, windSpeedMs: 1 });
  check('한여름 고습도는 체감온도가 실제 기온보다 높고 근사값으로 표시된다', {
    higher: result.feelsLikeC > 33,
    isApproximate: result.isApproximate,
  }, { higher: true, isApproximate: true });
}

// 옷차림 — 아침 18도 · 저녁 11도면 더 낮은 저녁 기준(11도 -> "자켓·가디건" 구간)으로 판정한다
check(
  '아침만 보면 놓칠 저녁 추위를 옷차림에 반영한다',
  pickWardrobe({ currentTempC: 18, eveningTempC: 11 }, wardrobeTable),
  '트렌치코트·얇은 패딩', // min(18,11)=11 -> 12도 구간 미달, 9도 구간("트렌치코트·얇은 패딩")에 해당
);
check('한여름 낮 최저도 28도 이상이면 반팔', pickWardrobe({ currentTempC: 30, eveningTempC: 28 }, wardrobeTable), '반팔·린넨');
check(
  '표 범위 밖(영하 극한)은 가장 낮은 구간으로 폴백',
  pickWardrobe({ currentTempC: -20, eveningTempC: -25 }, wardrobeTable),
  '패딩·두꺼운 코트·목도리',
);

// 미세먼지 — 둘 중 더 나쁜 등급 기준
check('PM10 나쁨·PM2.5 보통이면 마스크 권장', judgeDust({ pm10Grade: 3, pm25Grade: 2 }), {
  grade: 3,
  text: '나쁨',
  needMask: true,
});
check('둘 다 좋음/보통이면 마스크 불필요', judgeDust({ pm10Grade: 1, pm25Grade: 2 }), {
  grade: 2,
  text: '보통',
  needMask: false,
});

console.log(`\n총 ${passed}건 통과`);
