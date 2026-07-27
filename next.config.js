/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Landing page hidden for now — send the root route to /login
  async redirects() {
    return [
      {
        source: '/',
        destination: '/login',
        permanent: false,
      },
    ];
  },
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
