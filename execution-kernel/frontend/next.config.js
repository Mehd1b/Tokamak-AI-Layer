const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@tokamak/execution-kernel-sdk'],
  serverExternalPackages: ['better-sqlite3'],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'pino-pretty': false,
      '@react-native-async-storage/async-storage': false,
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      '@ek-sdk': path.resolve(__dirname, '../sdk/src'),
    };
    config.externals.push('pino-pretty');
    return config;
  },
};

module.exports = nextConfig;
