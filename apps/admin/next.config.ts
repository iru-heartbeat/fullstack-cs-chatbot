import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // モノレポ内の TS ソースのまま配布している共有パッケージをビルド対象にする
  transpilePackages: ["@cs-chatbot/shared", "widget"],
  partialPrefetching: true,
};

export default nextConfig;
