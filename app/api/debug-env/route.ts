import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const envKeys = Object.keys(process.env);
  const dbKeys = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_PRISMA_URL"];
  
  const results: Record<string, { defined: boolean; length?: number; parseStatus?: string; parseError?: string }> = {};

  for (const key of dbKeys) {
    const value = process.env[key];
    if (value === undefined) {
      results[key] = { defined: false };
    } else {
      let parseStatus = "success";
      let parseError = "";
      try {
        new URL(value);
      } catch (e) {
        parseStatus = "failed";
        parseError = (e as Error).message;
      }
      results[key] = {
        defined: true,
        length: value.length,
        parseStatus,
        parseError,
      };
    }
  }

  return NextResponse.json({
    message: "Debug environment",
    results,
    allKeysPresent: envKeys.filter(k => k.includes("URL") || k.includes("DATABASE") || k.includes("POSTGRES")),
  });
}
