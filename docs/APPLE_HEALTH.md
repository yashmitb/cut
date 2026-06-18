# Apple Health integration — research & plan

Status: **research only, not started.** Awaiting approval before any implementation.

## TL;DR

- A **web app / PWA cannot read or write Apple Health (HealthKit) directly.** There is
  no web API for HealthKit — it's native-iOS only. So `cut-eta.vercel.app` can't talk
  to Health on its own.
- The realistic ways to bridge are:
  1. **Apple Shortcuts bridge** ← recommended. No App Store, no native app, works with
     the current web deployment. Shortcuts reads Health and POSTs it to a new API
     endpoint (and can write nutrition back into Health).
  2. **Native wrapper app** (Capacitor + a HealthKit plugin). True background two-way
     sync, but needs an Apple Developer account, a Mac/Xcode build pipeline, and turns
     "just a website" into an app you maintain.
  3. **Manual export/import** of the Health archive. Clunky, not real-time — not worth it.

## Why direct access is impossible

HealthKit is exposed only through the native `HKHealthStore` framework, gated by an
app entitlement configured in Xcode and per-type user permission prompts. Apple has
never shipped a Safari/web API for it, and there's nothing new as of 2026. A PWA added
to the Home Screen still runs in the web sandbox with no HealthKit access.

## What's actually worth syncing (for a cut)

**Pull (Health → Cut)** — highest value first:
- **Body weight** — if you weigh on a scale that syncs to Health, auto-fill Cut's weight
  log + trend chart. Biggest win, smallest effort.
- **Active energy burned** (Apple Watch) — could feed an "adaptive" calorie budget
  (eat back some of what you burned). Real product decision, not just plumbing.
- Steps / workouts — nice context, lower priority.

**Push (Cut → Health)** — so the Apple ecosystem sees your nutrition:
- Dietary energy (calories), protein, carbs, fat, and water.

## Option 1 — Shortcuts bridge (recommended)

### How it works
- A **Shortcut** on your iPhone uses **"Find Health Samples"** to read e.g. the latest
  Body Mass, then **"Get Contents of URL"** to POST it as JSON to a new endpoint on Cut.
- A second Shortcut can **"Get Contents of URL"** from a Cut export endpoint and
  **"Log Health Sample"** to write today's calories/macros/water into Health.
- Triggered manually (a Home-Screen/widget tap) or via a time-based **Automation**.

### What I'd build (when approved)
- `POST /api/health/ingest` — accepts `{ weight_kg, date, active_kcal?, ... }`, validates
  a per-user token, upserts into `weight_logs` (and later an energy table).
- `GET /api/health/export?date=…` — returns the day's totals for the write-back Shortcut.
- A **"Health Sync" card in Profile**: generates a long random **sync token** (stored
  per-user), shows the exact URL + a one-tap **"Add Shortcut"** iCloud link, and
  copy-paste setup steps. The token is how the Shortcut authenticates (the Supabase
  OAuth cookie flow can't run inside Shortcuts).

### What you'd do (one-time, ~5 min)
1. Open Profile → Health Sync → tap the shared Shortcut link → add it.
2. Approve the Health read permission the first time it runs.
3. Optionally add an Automation (e.g., run every morning).

### Pros
- Zero native code, no Apple Developer account, no app review, works today.
- You stay on the plain web app + Vercel.
- Genuinely useful for the #1 case (weight auto-logging).

### Cons / caveats
- **Health data is "sensitive," so fully hands-off background automation may still prompt
  for confirmation** — manual "tap to sync" (or a morning automation you approve) is the
  reliable path. Not silent 24/7 sync.
- Setup is a few manual steps on your phone.
- Sync token is bearer auth — fine for a personal app; treat the link as a secret.

### Effort
- Phase 1 (pull weight only): small — one endpoint, one Profile card, one Shortcut.
- Phase 2 (active energy → adaptive budget): medium — schema + budget math + UI.
- Phase 3 (push nutrition to Health): small-medium — export endpoint + a write Shortcut.

## Option 2 — Native wrapper (Capacitor + HealthKit)

Wrap the existing Next.js site in a Capacitor iOS shell and use a community HealthKit
plugin for real, permissioned, background-capable two-way sync.

**Requirements**
- Apple Developer Program — **$99/year**.
- A **Mac with Xcode** to build; install via TestFlight or sideload (free 7-day certs
  for personal sideload, or TestFlight for 90-day builds).
- Add the HealthKit capability/entitlement; handle permission prompts.
- Maintain a second build target alongside the web app.

**Pros:** the "real" experience — smoother, background sync, no Shortcuts fiddling.
**Cons:** meaningful ongoing overhead, a Mac + yearly fee, and it stops being "just a
website." Overkill for one user unless you want a polished installable app.

## Option 3 — Manual export/import

Health app → Profile → Export All Health Data → a large XML in a `.zip`. Cut could parse
it. It's a bulk, manual, non-real-time dump. Only useful for a one-off backfill, not
ongoing sync. Not recommended.

## Recommendation

Start with **Option 1, Phase 1: pull body weight from Health into Cut.** It's the highest
value (auto weight log + trend), the least effort, and needs nothing from Apple. We can
layer on active-energy and nutrition write-back afterward if it feels worth it.

### What I'd need from you to proceed (later)
- Confirm direction(s): pull weight? pull active energy? push nutrition?
- Whether a per-morning Automation is acceptable (may need a tap) vs. on-demand only.
- Nothing else — no Apple account or payment needed for the Shortcuts route.

## Sources
- Apple HealthKit docs (native-only): https://developer.apple.com/documentation/healthkit
- Authorizing access to health data: https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data
- Personal Apple Health API via Shortcuts + serverless (precedent):
  https://blog.maximeheckel.com/posts/build-personal-health-api-shortcuts-serverless/
- Running automations without confirmation (and health-data limits):
  https://support.apple.com/guide/shortcuts/apd602971e63/ios
