import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Generated app icon — the calorie ring mark on a dark glass tile.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 30% 20%, #1b1830, #07070a)",
        }}
      >
        <svg width="340" height="340" viewBox="0 0 100 100">
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
