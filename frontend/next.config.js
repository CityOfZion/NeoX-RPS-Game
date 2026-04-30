/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Uncomment to build a static export (out/) for static hosting; then use "next export" or deploy the out/ folder.
  // output: 'export',
  // Use webpack explicitly to avoid Turbopack compatibility issues
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
  // Add empty turbopack config to silence warning when using webpack
  turbopack: {},
}

module.exports = nextConfig
