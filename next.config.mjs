/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  // GitHub Pages 프로젝트 페이지(username.github.io/워크스페이스1)로 배포한다 — 저장소 이름이
  // 확정됐으니(§14) 경로를 여기 고정한다. 저장소 이름이 바뀌면 이 값도 같이 바꿔야 한다.
  basePath: '/workspace1',
  // GitHub Pages는 실제 폴더(index.html)를 찾아서 서빙한다 — trailingSlash 없이 내보내면
  // "/settings" 같은 경로가 404가 난다.
  trailingSlash: true,
  // CLAUDE.md는 이 저장소의 규칙 파일이라 Next.js가 자동으로 덧붙이는 안내 블록을 넣지 않는다.
  agentRules: false,
};

export default nextConfig;
