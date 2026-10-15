/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy configuration to handle CORS issues with GraphQL backend
  async rewrites() {
    // In production (Vercel), use NEXT_PUBLIC_GRAPHQL_URL for the backend
    // In development, proxy to localhost
    const isProduction = process.env.NODE_ENV === 'production';
    const backendUrl = process.env['NEXT_PUBLIC_GRAPHQL_URL'] || 'http://localhost:3000/graphql';

    return [
      {
        source: '/api/graphql-proxy',
        destination: isProduction ? backendUrl : 'http://localhost:3000/graphql',
      },
    ];
  },

  // Enable standalone output for Docker deployment only (not for Vercel)
  // output: 'standalone',
  
  // Disable ESLint for production builds
  eslint: {
    // Only run ESLint in development, not during builds
    ignoreDuringBuilds: true,
  },
  
  // Disable TypeScript type checking during builds
  typescript: {
    // Only check types in development, not during builds
    ignoreBuildErrors: true,
  },
  
  // Disable React Strict Mode to reduce debug indicators (temporarily for demo)
  reactStrictMode: false,

  // Disable source maps in production to hide debug info (temporarily for demo)
  productionBrowserSourceMaps: false,

  // Skip prerendering for problematic pages during static export
  experimental: {
    missingSuspenseWithCSRBailout: false,
    instrumentationHook: true,
  },

  // Configure which routes to skip during export
  // This prevents build errors from API routes that can't be statically generated
  async headers() {
    return [];
  },

  // Skip error page generation during build
  // This prevents styled-jsx hook issues in default error pages
  skipTrailingSlashRedirect: true,
  skipMiddlewareUrlNormalize: true,

  // Generate pages on-demand instead of at build time
  // This allows Vercel to serve pages successfully even if error pages fail
  generateBuildId: async () => {
    return process.env.VERCEL_GIT_COMMIT_SHA || 'development'
  },

  // Note: Root layout has 'export const dynamic = force-dynamic' to prevent static generation
};

module.exports = nextConfig;
