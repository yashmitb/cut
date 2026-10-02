import type { NextConfig } from "next";

// Signed iOS Shortcuts served from /public/shortcuts (built by
// scripts/shortcuts/build.sh). The download filename becomes the shortcut's
// name when it's added on iPhone.
const SHORTCUTS: Record<string, string> = {
  "log-food": "Log Food",
  "tell-cut": "Tell Cut",
  "log-weight": "Log Weight",
  "whats-left": "What's Left",
  "log-favorite": "Log Favorite",
};

const nextConfig: NextConfig = {
  // Pin the workspace root so Next doesn't get confused by lockfiles higher up.
  turbopack: { root: __dirname },
  async headers() {
    return Object.entries(SHORTCUTS).map(([slug, name]) => ({
      source: `/shortcuts/${slug}.shortcut`,
      headers: [
        { key: "Content-Type", value: "application/octet-stream" },
        { key: "Content-Disposition", value: `attachment; filename="${name}.shortcut"` },
        { key: "Cache-Control", value: "public, max-age=3600" },
      ],
    }));
  },
};

export default nextConfig;
