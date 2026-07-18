import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@clycites/contracts', '@clycites/ui'],
};

export default nextConfig;
