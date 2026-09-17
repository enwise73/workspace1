// GONOW_CONFIG Secret(설정 화면 "설정 내보내기"로 만든 JSON 문자열)을 읽어온다.
// 정류장ID·목표시각 같은 실제 값이 들어있는 값이라 GitHub Secrets에만 둔다 (CLAUDE.md §2 A4).

export function loadConfigFromEnv() {
  const raw = process.env.GONOW_CONFIG;
  if (!raw) {
    throw new Error('GONOW_CONFIG Secret이 설정되지 않았습니다. 설정 화면의 "설정 내보내기"를 등록하세요.');
  }
  return JSON.parse(raw);
}
