import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  /**
   * Same-origin proxy to the Spring backend so the session and CSRF cookies
   * stay first-party. BACKEND_ORIGIN is server-only (e.g. http://localhost:8080).
   */
  async rewrites() {
    const backend = process.env.BACKEND_ORIGIN?.replace(/\/+$/, "");
    if (!backend) return [];
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/logout", destination: `${backend}/logout` },
    ];
  },
};

export default nextConfig;
