import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  try {
    const rows = await db()
      .select()
      .from(schema.auditLog)
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(5000);

    const headers = [
      "id",
      "created_at",
      "action",
      "entity",
      "entity_id",
      "actor_email",
      "payload",
    ];

    const csvRows = rows.map((r) => [
      r.id,
      r.createdAt?.toISOString?.() ?? r.createdAt,
      r.action,
      r.entity,
      r.entityId ?? "",
      r.actorEmail ?? "",
      r.payload ?? "",
    ]);

    const csv =
      "\ufeff" +
      [headers, ...csvRows]
        .map((row) => row.map(csvEscape).join(","))
        .join("\r\n");

    const today = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="auditoria-${today}.csv"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
