import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql, USER_ID } from "@/lib/db";
import { computeTargets, todayLocal } from "@/lib/nutrition";
import type { Activity, Profile, Rate, Sex, Units } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();
    const rows = await sql<Profile[]>`SELECT * FROM profile WHERE id = ${USER_ID}`;
    return NextResponse.json({ profile: rows[0] ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const b = await req.json();

    const input = {
      age: Number(b.age),
      sex: b.sex as Sex,
      height_cm: Number(b.height_cm),
      weight_kg: Number(b.weight_kg),
      goal_weight_kg: Number(b.goal_weight_kg),
      activity: b.activity as Activity,
      rate: b.rate as Rate,
    };

    if (!input.age || !input.height_cm || !input.weight_kg) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const t = computeTargets(input);
    const units = (b.units as Units) || "imperial";
    const name = b.name ? String(b.name).slice(0, 60) : null;

    await sql`
      INSERT INTO profile (
        id, name, age, sex, height_cm, weight_kg, goal_weight_kg, activity, rate, units,
        target_calories, target_protein, target_carbs, target_fat, target_fiber, updated_at
      ) VALUES (
        ${USER_ID}, ${name}, ${input.age}, ${input.sex}, ${input.height_cm}, ${input.weight_kg},
        ${input.goal_weight_kg}, ${input.activity}, ${input.rate}, ${units},
        ${t.target_calories}, ${t.target_protein}, ${t.target_carbs}, ${t.target_fat}, ${t.target_fiber}, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, age = EXCLUDED.age, sex = EXCLUDED.sex,
        height_cm = EXCLUDED.height_cm, weight_kg = EXCLUDED.weight_kg,
        goal_weight_kg = EXCLUDED.goal_weight_kg, activity = EXCLUDED.activity,
        rate = EXCLUDED.rate, units = EXCLUDED.units,
        target_calories = EXCLUDED.target_calories, target_protein = EXCLUDED.target_protein,
        target_carbs = EXCLUDED.target_carbs, target_fat = EXCLUDED.target_fat,
        target_fiber = EXCLUDED.target_fiber, updated_at = now()
    `;

    // seed today's weight so the progress chart has a starting point
    await sql`
      INSERT INTO weight_logs (user_id, log_date, weight_kg)
      VALUES (${USER_ID}, ${todayLocal()}, ${input.weight_kg})
      ON CONFLICT (user_id, log_date) DO UPDATE SET weight_kg = EXCLUDED.weight_kg
    `;

    const rows = await sql<Profile[]>`SELECT * FROM profile WHERE id = ${USER_ID}`;
    return NextResponse.json({ profile: rows[0], targets: t });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
