import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control",   value: "on" },
  { key: "X-Frame-Options",          value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options",   value: "nosniff" },
  { key: "Referrer-Policy",          value: "strict-origin-when-cross-origin" },
  { key: "X-XSS-Protection",         value: "1; mode=block" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Remove X-Powered-By header
  poweredByHeader: false,

  // Security headers on all routes
  headers: () =>
    Promise.resolve([{ source: "/(.*)", headers: securityHeaders }]),

  // Standalone output for Docker/Render deployments
  // output: "standalone",  // Uncomment if deploying frontend via Docker

  // Image optimization — allow only trusted domains
  images: {
    domains: [],
    remotePatterns: [],
  },

  // Turbopack config (Next.js 16 default bundler)
  turbopack: {},
};

export default nextConfig;
