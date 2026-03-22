const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@tokamak/execution-kernel-sdk'],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'pino-pretty': false,
      '@react-native-async-storage/async-storage': false,
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      '@ek-sdk': path.resolve(__dirname, '../sdk/src'),
      // Pin SDK external deps to frontend's copies so builds work on Vercel
      // (the SDK's node_modules may not exist in deployed environments)
      'viem': path.resolve(__dirname, 'node_modules/viem'),
      'wagmi': path.resolve(__dirname, 'node_modules/wagmi'),
      '@tanstack/react-query': path.resolve(__dirname, 'node_modules/@tanstack/react-query'),
    };
    config.externals.push('pino-pretty');
    return config;
  },
};

module.exports = nextConfig;
