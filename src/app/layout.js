import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

// GitHub Pages 프로젝트 페이지 basePath — next.config.mjs와 값을 맞춰 유지한다. public/ 밑 파일은
// Next.js가 자동으로 basePath를 붙여주지 않아 여기서 직접 붙인다.
const BASE_PATH = "/workspace1";

export const metadata = {
  title: "GoNow",
  description: "영업일 아침에만, 날씨·준비물과 함께 지금 나가라/N분 뒤 나가라를 알려주는 개인용 통근 도우미",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1c1a17",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link rel="manifest" href={`${BASE_PATH}/manifest.json`} />
        <link rel="icon" href={`${BASE_PATH}/icons/icon-192.png`} />
        <link rel="apple-touch-icon" href={`${BASE_PATH}/icons/icon-180.png`} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GoNow" />
      </head>
      <body>
        <div className="app-shell">{children}</div>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
