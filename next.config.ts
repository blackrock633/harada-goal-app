import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Browsers ignore HSTS over plain http, so this is harmless for localhost `next start`.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];
// The Content-Security-Policy is per-request (it carries a script nonce), so it is set in src/middleware.ts.

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  // The app uses no next/image; turning the optimizer off removes /_next/image as an attack surface.
  images: { unoptimized: true },
  serverExternalPackages: ['@electric-sql/pglite', '@node-rs/argon2'],
  // The domain layer uses ESM-style './x.js' specifiers for .ts files (valid for tsc's bundler
  // resolution); teach webpack the same mapping.
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
