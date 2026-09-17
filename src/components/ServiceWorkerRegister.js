"use client";

import { useEffect } from "react";

// GitHub Pages 프로젝트 페이지 basePath — next.config.mjs와 값을 맞춰 유지한다.
const BASE_PATH = "/workspace1";

// PWA 설치(홈 화면 추가)를 위한 서비스워커 등록. 렌더링할 게 없어 null만 반환한다.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` })
      .catch((err) => console.error("서비스워커 등록 실패", err));
  }, []);

  return null;
}
