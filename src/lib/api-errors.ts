import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { VExpensesError } from "./vexpenses";

export function handleApiError(e: unknown) {
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "invalid_payload", issues: e.issues },
      { status: 400 },
    );
  }
  if (e instanceof VExpensesError) {
    return NextResponse.json(
      { error: e.message, status: e.status },
      { status: e.status >= 400 && e.status < 600 ? e.status : 502 },
    );
  }
  const msg = e instanceof Error ? e.message : String(e);
  console.error("API error", e);
  return NextResponse.json({ error: msg }, { status: 500 });
}
