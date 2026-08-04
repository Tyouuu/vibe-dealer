import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
  // One address, not two.
  //
  // Both cwc456.com and www.cwc456.com point at this deployment, and without
  // this they each served the app in full. That is not just untidy: the
  // Supabase session cookie is scoped to the host that set it, so signing in
  // at www and later opening the bare domain would present a signed-out app
  // and ask for the password again. Anyone who typed the other form would
  // quietly have a second, separate session.
  //
  // 308 (permanent: true) rather than 302, because this is the permanent
  // shape of the site and the method must survive the redirect — a 301/302
  // is allowed to turn a POST into a GET, which would silently drop a form
  // submission that happened to arrive on the www host.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.cwc456.com" }],
        destination: "https://cwc456.com/:path*",
        permanent: true,
      },
    ];
  },
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

// Wrapped for source-map upload, so a production stack trace points at real
// source lines instead of minified bundle offsets. Everything below is
// inert without the Sentry env vars, so builds without them are unchanged.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Upload needs SENTRY_AUTH_TOKEN; without it the build must still succeed
  // rather than failing a deploy over a monitoring nicety.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Strip the uploaded maps from the client bundle — they're for Sentry to
  // resolve traces, not for anyone opening devtools on the live app.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Routes browser telemetry through this app's own origin. Without it, ad
  // blockers eat a good share of client-side error reports — and the CSP
  // above has no connect-src entry for Sentry's ingest domain, so this is
  // also what keeps the two consistent.
  tunnelRoute: "/monitoring",
  // No disableLogger here: it's deprecated in @sentry/nextjs 10, and its
  // replacement (webpack.treeshake.removeDebugLogging) is webpack-only —
  // this project builds with Turbopack, so the option would do nothing but
  // emit a deprecation warning on every build.
});
