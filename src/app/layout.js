import "./globals.css";

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
      </head>
      <body>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
