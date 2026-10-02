import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import { recentCorrections } from "@/lib/corrections";
import { analyzeImage, aiErrorPayload } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
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

    const corrections = await recentCorrections(userId);
    const result = await analyzeImage(userId, image, mimeType, corrections, hint);
    return NextResponse.json(result);
  } catch (e) {
    const { status, body } = aiErrorPayload(e);
    return NextResponse.json(body, { status });
  }
}
