import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon (solid background, ring inset for the maskable safe area).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07070a",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="10" />
          <circle
            cx="50"
            cy="50"
            r="38"
            fill="none"
            stroke="#c9b8f0"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray="175 239"
            transform="rotate(-90 50 50)"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
