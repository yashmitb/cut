# Cut — AI calorie & macro tracker

A minimal, liquid-glass calorie tracker built for cutting. Snap a photo of your
food, an AI reads the plate, and your day's calories + macros update
automatically. Black-and-white UI, pastel charts, full dark mode.

![stack](https://img.shields.io/badge/Next.js-16-black) ![ai](https://img.shields.io/badge/Gemini-2.5%20Pro-c9b8f0) ![db](https://img.shields.io/badge/Postgres-cloud%20sync-a8d0f0)

## Features

- **📸 Snap & log** — photograph a meal; Gemini 2.5 Pro estimates each item's
  calories, protein, carbs, fat, fiber, sugar & sodium, with a **confidence
  score per item**. Low-confidence items get flagged before they're added.
- **💬 Coach that learns** — correct the AI in plain English ("that's 1 cup of
  rice, not 2"). Corrections are saved and fed back into future prompts, so it
  gets more accurate the more you use it.
- **⌨️ Manual AI entry** — just type "1 cup rice, 6 oz chicken" and it logs the macros.
- **🎯 Smart onboarding** — height/weight/activity/goal → Mifflin-St Jeor TDEE,
  a recommended calorie deficit, and protein/carb/fat/fiber targets, with safety
  warnings if your pace is too aggressive.
- **📊 Progress** — pastel charts for calories, protein, fiber and weight trend,
  plus adherence and weight-change stats.
- **🍽️ Meals** — food is grouped into breakfast / lunch / dinner / snacks, each
  with its own calorie subtotal. The right meal is auto-picked by time of day.
- **⚡ Quick add (no AI)** — re-log foods you eat often with one tap, straight
  from a "recent foods" row — saves your limited API calls.
- **📅 History** — step back to any past day to review, edit, or back-fill it.
- **🤖 "What should I eat?"** — AI suggests a meal that fits your remaining
  macros for the day, prioritising protein.
- **🔥 Streaks** — a logging streak to keep you consistent.
- **📱 Installable (PWA)** — add it to your phone's home screen and it runs
  full-screen like a native app, offline shell included.
- **🔄 Cloud sync** — log on your phone, review on your laptop. Everything's in Postgres.
- **💧 Extras** — water tracking, daily reset, inline-editable items, weight logging.

## Nutrition model (the research)

- **BMR**: Mifflin-St Jeor — the most accurate predictive equation for adults.
- **TDEE**: BMR × activity factor (1.2–1.9).
- **Deficit**: ~275 / 550 / 825 kcal/day for relaxed / steady / aggressive
  (1 kg fat ≈ 7700 kcal). Floored at 1500 (men) / 1200 (women) kcal.
- **Protein**: 2.0 g/kg bodyweight to preserve muscle on a deficit (ISSN).
- **Fat**: 0.8 g/kg (hormone floor). **Carbs**: fill the rest. **Fiber**: 14 g / 1000 kcal.

## Setup

### 1. Install

```bash
npm install
```

### 2. Get a Gemini API key (free)

Create one at **https://aistudio.google.com/apikey**.

### 3. Get a Postgres database (free, for cloud sync)

Any Postgres works. Easiest free options:

- **Neon** — https://neon.tech → create project → copy the connection string.
- **Supabase** — https://supabase.com → Project → Settings → Database → URI.
- **Vercel Postgres** — add it from the Vercel dashboard (auto-sets the env var).

> A local Postgres also works for development — the schema is created
> automatically on first run. But for phone↔laptop sync you want a **hosted** DB.

### 4. Configure env

Copy the template and fill it in:

```bash
cp .env.example .env.local
```

```ini
GEMINI_API_KEY=AIza...             # optional — you can also paste it in-app
GEMINI_MODEL=gemini-2.5-flash      # free-tier friendly; swap to pro/newer anytime
DATABASE_URL=postgres://user:pass@host/db?sslmode=require
```

> **Tip:** the Gemini key is optional in the env file. You can link it from
> **Profile → AI connection** instead — paste your key, hit **Link**, and it
> auto-runs a **connection test**. A key set there is stored in your database
> (so it syncs across devices) and overrides the env var. The status dot tells
> you at a glance whether a working key is linked.

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000 — you'll be taken through onboarding first.

## Deploy to Vercel

1. Push this folder to a Git repo and import it in Vercel (or use the `vercel` CLI).
2. In **Project → Settings → Environment Variables**, add `GEMINI_API_KEY`,
   `GEMINI_MODEL`, and `DATABASE_URL`.
3. Deploy. The database schema auto-creates on the first request.

Since it's just for you, there's no auth — all data lives under a single user.

## Authentication & multi-user sync (Supabase)

Sign-in is powered by Supabase Auth. When `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set, the app requires sign-in and
scopes every row to the logged-in user's id, so you can log in from any device
and see the same data. If those vars are **absent** (e.g. pure local dev), the
app runs in single-user mode with no login.

**Two sign-in methods are built in:**

- **Email magic link** — works out of the box, no provider setup.
- **Continue with Google** — needs Google enabled in Supabase (steps below).

### Enable Google OAuth (one-time)

1. **Supabase → Authentication → Sign In / Providers → Google → enable.**
2. Create OAuth credentials in **Google Cloud Console → APIs & Services →
   Credentials → OAuth client ID → Web application**.
   - Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`
     (Supabase shows the exact URL on the Google provider page).
3. Paste the **Client ID** and **Client secret** into Supabase → Save.
4. **Supabase → Authentication → URL Configuration:**
   - **Site URL**: your production URL (e.g. `https://cut-eta.vercel.app`).
   - **Redirect URLs**: add `https://cut-eta.vercel.app/auth/callback` (and
     `http://localhost:3000/auth/callback` for local testing).

That's it — `/auth/callback` exchanges the code for a session, and the proxy
keeps it refreshed. Sign out from **Profile → Sign out**.

> Data security: queries go through the pooled Postgres connection and are
> filtered by the **server-verified** user id (not anything the client sends),
> so users only ever see their own rows.

## Switching the AI model

Everything routes through env vars in `lib/gemini.ts`:

- `GEMINI_MODEL` — used for image analysis (default `gemini-2.5-flash`).
- `GEMINI_TEXT_MODEL` — optional, used for text chat/manual entry. Defaults to
  `GEMINI_MODEL`. Set it to `gemini-2.5-flash` to make typing faster/cheaper.

When Google ships a newer model, just change `GEMINI_MODEL` — no code changes.

## Tech

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Recharts ·
`postgres` · `@google/genai`.
