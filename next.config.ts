import type { NextConfig } from "next";

// Baseline hardening from the security audit (docs/security-and-feature-gap-
// audit.md) — this app had no security headers at all. Uses 'unsafe-inline'
// for script-src/style-src rather than Next's stricter nonce-based CSP
// (its own docs' recommended non-nonce fallback): the app renders React
// inline style={{...}} props pervasively (status dots, region-chip swatches)
// which compile to inline style="..." attributes that a strict style-src
// would silently block, and a nonce-based CSP forces every page to dynamic
// rendering — both real tradeoffs worth a deliberate decision, not a blind
// change bundled into a security-headers pass.
const isDev = process.env.NODE_ENV === "development";
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://*.supabase.co;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
