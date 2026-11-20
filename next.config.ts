import type { NextConfig } from 'next';

/**
 * Security headers are set per-request in `src/proxy.ts` because a strict CSP
 * needs a fresh nonce for every request. Only non-security build options live here.
 */
const nextConfig: NextConfig = {
  // Do not advertise the framework version.
  poweredByHeader: false,
  reactStrictMode: true,
  // NOTE: nonce-based CSP forces dynamic rendering; see README "Security decisions".
  experimental: {
    // Keep the client bundle small; this app has no server actions.
    optimizePackageImports: ['zod'],
  },
};

export default nextConfig;
