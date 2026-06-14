import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next doesn't get confused by lockfiles higher up.
  turbopack: { root: __dirname },
};

export default nextConfig;
