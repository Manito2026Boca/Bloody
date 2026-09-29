import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  assetPrefix: process.env.NODE_ENV === 'production' ? '/_public-web' : undefined,
};

export default config;
