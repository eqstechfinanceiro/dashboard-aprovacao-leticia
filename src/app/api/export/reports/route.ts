import { NextResponse } from "next/server";
import { getAllReportsPaginated } from "@/lib/vexpenses";
import { handleApiError } from "@/lib/api-errors";
import type { ReportStatus } from "@/types/vexpenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUS: ReportStatus[] = [
  "ABERTO",
  "ENVIADO",
  "APROVADO",
  "REPROVADO",
  "REABERTO",
  "PAGO",
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const search = url.searchParams.get("search") ?? undefined;

    const status = statusParam
      ? (statusParam
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter((s): s is ReportStatus =>
            (ALLOWED_STATUS as string[]).includes(s),
          ) as ReportStatus[])
      : undefined;

    const reports = await getAllReportsPaginated(
      {
        status,
        search,
        include: ["teamMember", "costsCenter", "project", "approvalFlow"],
      },
      { perPage: 200, maxPages: 40, revalidate: 0 },
    );

    const headers = [
      "id",
      "status",
      "colaborador",
      "email",
      "setor",
      "centro_custo",
      "projeto",
      "fluxo_aprovacao",
      "descricao",
      "total",
      "sent_at",
      "approved_at",
      "rejected_at",
      "payment_date",
      "created_at",
      "updated_at",
    ];

    const rows = reports.map((r) => [
      r.id,
      r.status,
      r.team_member?.name ?? "",
      r.team_member?.email ?? "",
      r.team_member?.departmentName ?? "",
      r.costs_center?.name ?? "",
      r.project?.name ?? "",
      r.approval_flow?.name ?? "",
      r.description ?? "",
      r.total ?? 0,
      r.sent_at ?? "",
      r.approved_at ?? "",
      r.rejected_at ?? "",
      r.payment_date ?? "",
      r.created_at ?? "",
      r.updated_at ?? "",
    ]);

    // UTF-8 BOM so Excel opens the file with the correct encoding.
    const csv =
      "\ufeff" +
      [headers, ...rows]
        .map((row) => row.map(csvEscape).join(","))
        .join("\r\n");

    const today = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="relatorios-${today}.csv"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
