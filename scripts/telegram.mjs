// 텔레그램 메시지 전송. GitHub Actions에서만 쓴다.
// 토큰은 GitHub Secrets(TELEGRAM_BOT_TOKEN)에서만 읽는다 — 코드에 절대 적지 않는다 (CLAUDE.md §2 A3).

export async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID Secret이 설정되지 않았습니다.');
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`텔레그램 전송 실패 (${res.status}): ${body}`);
  }
}
