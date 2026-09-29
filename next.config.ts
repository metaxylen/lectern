import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      sharp: { browser: "./lib/stt/empty-module.ts" },
      "onnxruntime-node": { browser: "./lib/stt/empty-module.ts" },
    },
  },
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, sharp: false, "onnxruntime-node": false };
    return config;
  },
};

export default nextConfig;
