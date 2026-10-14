import type { NextConfig } from "next";

const apiOrigin = (process.env.USROCK_API_ORIGIN ?? "http://127.0.0.1:3333").replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
