/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Exclude the newlandpage directory from the build
  webpack: (config) => {
    config.externals = [...(config.externals || []), { newlandpage: 'newlandpage' }];
    return config;
  },
  // Ignore TypeScript errors during build (optional)
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
