const { withPlausibleProxy } = require("next-plausible");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  turbopack: {},
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'pocketbase': require.resolve('pocketbase'),
    };
    return config;
  },
};

const plausibleHost = process.env.NEXT_PUBLIC_PLAUSIBLE_HOST;

module.exports = plausibleHost
  ? withPlausibleProxy({ customDomain: plausibleHost })(nextConfig)
  : nextConfig;
