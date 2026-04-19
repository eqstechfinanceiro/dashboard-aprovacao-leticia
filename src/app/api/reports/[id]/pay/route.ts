import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { payReport } from "@/lib/vexpenses";
import { db, schema } from "@/db";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  try {
    const body = await req.json().catch(() => ({}));
    await payReport(id, body.payment_date);
    await db()
      .insert(schema.auditLog)
      .values({
        action: "REPORT_PAID",
        entity: "report",
        entityId: String(id),
        payload: body,
      });
    revalidateTag("reports");
    revalidateTag(`report:${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
