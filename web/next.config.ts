import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  images: {
    // Enable static image optimization for better caching
    unoptimized: false,
    // Set cache time for optimized images (1 year)
    minimumCacheTTL: 31536000,
  },
  // Add cache headers for static assets
  async headers() {
    return [
      {
        // Cache all static image assets under `public/`. Use a long max-age without `immutable`
        // since filenames are not fingerprinted with hashes.
        source: '/:all*\\.(jpg|jpeg|png|svg|ico|webp)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
