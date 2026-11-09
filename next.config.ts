import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  /**
   * Dev only: hide Next's floating "N" badge. On phones it sat on the bottom
   * nav and read like a menu button. Build errors still open the overlay.
   */
  devIndicators: false,
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
