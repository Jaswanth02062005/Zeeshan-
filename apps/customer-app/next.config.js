/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@zeeshans/shared'],
  output: 'export',
  images: { unoptimized: true }
};

module.exports = nextConfig;
