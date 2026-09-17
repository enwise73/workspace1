// 공휴일 동기화. .github/workflows/sync-holidays.yml이 월 1회 실행해 data/holidays.json을 갱신한다.
// 실행: node scripts/sync-holidays.mjs
//
// data/holidays.json을 커밋해두는 이유(PRD §6.2 결정4): 브리핑/리마인더가 매번 API를 부르지 않고도
// 영업일 게이트를 판정할 수 있게 해서, 공휴일 API가 잠깐 죽어도 게이트 자체는 죽지 않는다.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getHolidays } from '../src/lib/sources.js';
import { PROXY_BASE_URL } from '../src/lib/config.js';

const OUTPUT_PATH = fileURLToPath(new URL('../data/holidays.json', import.meta.url));

async function main() {
  const now = new Date();
  const thisYear = now.getFullYear();
  // 연말/연초 경계에서도 "다음 영업일" 계산이 끊기지 않도록 올해+내년을 같이 받는다.
  const [current, next] = await Promise.all([
    getHolidays({ baseUrl: PROXY_BASE_URL, year: thisYear }),
    getHolidays({ baseUrl: PROXY_BASE_URL, year: thisYear + 1 }),
  ]);

  const merged = [...new Set([...current, ...next])].sort();
  if (merged.length === 0) {
    throw new Error('공휴일 응답이 비어 있습니다 — API 문제일 수 있어 기존 파일을 덮어쓰지 않습니다.');
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`data/holidays.json 갱신: ${merged.length}건 (${thisYear}~${thisYear + 1})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
