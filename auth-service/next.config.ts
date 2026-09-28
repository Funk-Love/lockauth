import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 和 LockCloud / LockAI 一样打 standalone 包：线上只需要 node server.js
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
