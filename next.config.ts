import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  devIndicators: false,
  // allow the sandbox preview proxy to fetch /_next/* assets without warnings
  allowedDevOrigins: ["*.space-z.ai", "*.localhost"],
};

export default nextConfig;
