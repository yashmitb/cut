import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql, USER_ID } from "@/lib/db";
import { analyzeImage } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function recentCorrections(): Promise<string[]> {
  const rows = await sql<{ note: string }[]>`
    SELECT note FROM corrections WHERE user_id = ${USER_ID}
    ORDER BY created_at DESC LIMIT 15`;
  return rows.map((r) => r.note);
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const b = await req.json();
    let image: string = b.image || "";
    const hint: string | undefined = b.hint;
    if (!image) return NextResponse.json({ error: "No image provided." }, { status: 400 });

    // accept full data URLs or bare base64
    let mimeType = b.mimeType || "image/jpeg";
    const m = image.match(/^data:(.+?);base64,(.*)$/);
    if (m) {
      mimeType = m[1];
      image = m[2];
    }

    const corrections = await recentCorrections();
    const result = await analyzeImage(image, mimeType, corrections, hint);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
