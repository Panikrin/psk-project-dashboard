import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['panikrin.github.io', '127.0.0.1:5180'] },
  },
};

export default nextConfig;
