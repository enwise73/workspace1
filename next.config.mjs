/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  // CLAUDE.md는 이 저장소의 규칙 파일이라 Next.js가 자동으로 덧붙이는 안내 블록을 넣지 않는다.
  agentRules: false,
};

export default nextConfig;
