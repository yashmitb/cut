// App-icon badge (Badging API — iOS 16.4+ Home Screen apps, Chromium installs).
// Count = main meals whose reminder time has passed today with nothing logged,
// matching what the reminder cron sends, so logging a meal clears it right away.
import { missingMeals } from "./reminders";

type BadgeNav = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

export const REMINDERS_KEY = "cut.reminders.v1";

export function syncBadge(loggedMeals: Iterable<string>): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as BadgeNav;
  if (!nav.setAppBadge) return;
  let n = 0;
  try {
    const r = JSON.parse(localStorage.getItem(REMINDERS_KEY) || "null");
    if (r?.enabled) {
      const d = new Date();
      n = missingMeals(r.times || {}, new Set(loggedMeals), d.getHours() * 60 + d.getMinutes()).length;
    }
  } catch {
    /* storage unavailable — clear */
  }
  const p = n > 0 ? nav.setAppBadge(n) : nav.clearAppBadge?.();
  p?.catch(() => {});
}
