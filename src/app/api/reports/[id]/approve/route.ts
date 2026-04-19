import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { approveReport } from "@/lib/vexpenses";
import { db, schema } from "@/db";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  try {
    await approveReport(id);
    await db()
      .insert(schema.auditLog)
      .values({
        action: "REPORT_APPROVED",
        entity: "report",
        entityId: String(id),
      });
    revalidateTag("reports");
    revalidateTag(`report:${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
