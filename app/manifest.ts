import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cut — calorie tracker",
    short_name: "Cut",
    description: "A minimal, AI-powered calorie & macro tracker built for cutting.",
    start_url: "/",
    display: "standalone",
    background_color: "#07070a",
    theme_color: "#07070a",
    orientation: "portrait",
    // long-press menu on Android / desktop installs (iOS ignores this — the
    // Profile → "Log from your Home Screen" Shortcuts recipes cover iPhone)
    shortcuts: [
      { name: "Snap a meal", short_name: "Snap", url: "/add" },
      { name: "Describe food", short_name: "Describe", url: "/add?mode=text" },
      { name: "Log weight", short_name: "Weight", url: "/profile#weight" },
      { name: "Ask Cut AI", short_name: "Ask", url: "/ask" },
    ],
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "maskable" },
    ],
  };
}
