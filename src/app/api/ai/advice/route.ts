import { NextResponse } from "next/server";
import { computeAdvice } from "@/lib/ai-advice";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const result = await computeAdvice();
    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e);
  }
}
