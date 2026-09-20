import type { NextConfig } from 'next';

// Hardening headers (Phase 12). CSP stays report-free but strict enough for this app: scripts only
// from self, connections to Supabase, media from Microsoft (recording downloadUrl redirects).
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321').origin;
  } catch {
    return 'http://localhost:54321';
  }
})();

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseHost} https://accounts.google.com`,
  "media-src 'self' https://*.sharepoint.com https://*.microsoft.com https://*.office.net blob:",
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com " + supabaseHost,
  "base-uri 'self'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
