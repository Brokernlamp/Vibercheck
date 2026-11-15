import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
  outputFileTracingExcludes: {
    "*": [
      ".data/**/*",
      "benchmarks/**/*",
      "docs/**/*",
      "scripts/**/*",
      "tests/**/*",
      "dist/**/*",
      ".next/cache/**/*",
    ],
  },
  experimental: {
    serverActions: {
      // Source archives and analyst commentary can exceed the 1 MB default.
      bodySizeLimit: "30mb",
    },
  },
  async headers() {
    const headers = [...securityHeaders];
    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }
    return [{ source: "/(.*)", headers }];
  },
};

export default nextConfig;
