import type { NextConfig } from 'next';

/**
 * The API origin, reachable only from the browser in dev. The website itself
 * runs on 3000 and forwards every `/api/*` call here, so the browser never
 * talks cross-origin to the API: the `tk_session` cookie stays first-party and
 * no CORS preflight is ever needed.
 *
 * In production the API and website are normally behind the same host, so this
 * can be left pointing at the internal service address.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` },
      { source: '/health/:path*', destination: `${API_ORIGIN}/health/:path*` },
    ];
  },
};

export default nextConfig;
