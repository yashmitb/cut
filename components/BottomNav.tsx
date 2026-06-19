"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CameraIcon, ChartIcon, HomeIcon, UserIcon } from "./Icons";

export default function BottomNav() {
  const path = usePathname();
  // hide chrome on onboarding, capture flow, and auth pages (full-screen)
  if (path === "/onboarding" || path === "/add" || path === "/ask" || path === "/login" || path.startsWith("/auth")) {
    return null;
  }

  const tab = (href: string, Icon: typeof HomeIcon, label: string) => {
    const active = path === href;
    return (
      <Link
        href={href}
        className="flex flex-col items-center justify-center gap-1 py-1 px-3 pressable"
        style={{ color: active ? "var(--fg)" : "var(--faint)", transition: "color 0.25s ease" }}
      >
        <Icon
          width={24}
          height={24}
          strokeWidth={active ? 2.1 : 1.7}
          style={{ transform: active ? "translateY(-1px)" : "none", transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1)" }}
        />
        <span className="text-[10px] font-semibold tracking-wide">{label}</span>
        <span
          className="rounded-full"
          style={{
            width: active ? 5 : 0,
            height: 5,
            background: "var(--p-cal)",
            boxShadow: active ? "0 0 6px var(--p-cal)" : "none",
            transition: "width 0.28s cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </Link>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-2 pointer-events-none">
      <div className="glass-strong relative flex items-center w-full max-w-md rounded-[28px] px-2 h-[68px] pointer-events-auto">
        <div className="flex flex-1 justify-around">
          {tab("/", HomeIcon, "Today")}
          {tab("/progress", ChartIcon, "Progress")}
        </div>

        {/* elevated capture button */}
        <Link href="/add" aria-label="Add food" className="relative -mt-9 mx-1 flex-shrink-0 pressable">
          <div
            className="w-[60px] h-[60px] rounded-full flex items-center justify-center"
            style={{
              background: "linear-gradient(160deg,#ffffff,#d9d9e3)",
              boxShadow: "0 10px 30px -6px rgba(201,184,240,0.6), 0 0 0 6px rgba(7,7,10,0.92)",
              color: "#0a0a0a",
            }}
          >
            <CameraIcon width={27} height={27} strokeWidth={1.9} />
          </div>
        </Link>

        <div className="flex flex-1 justify-around">
          {tab("/profile", UserIcon, "Profile")}
        </div>
      </div>
    </nav>
  );
}
