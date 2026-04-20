import { NextResponse } from "next/server";
import { z } from "zod";
import { getReports } from "@/lib/vexpenses";
import { computeApprovalTimeStats, computeTopMembers } from "@/lib/analytics";
import { computeBalancesLive } from "@/lib/cash-balance";
import { computeAdvice } from "@/lib/ai-advice";
import { fmtBRL, fmtDuration } from "@/lib/format";
import { handleApiError } from "@/lib/api-errors";

export const runtime = "nodejs";

const bodySchema = z.object({ prompt: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const { prompt } = bodySchema.parse(await req.json());
    const lower = prompt.toLowerCase();

    // Regras determinísticas: identifica intenção e responde com base em dados reais.
    if (
      lower.includes("recomend") ||
      lower.includes("conselho") ||
      lower.includes("alerta")
    ) {
      const { advice } = await computeAdvice();
      if (advice.length === 0) {
        return NextResponse.json({
          answer:
            "Nenhuma recomendação disparada pelas regras no momento — está tudo em ordem.",
        });
      }
      return NextResponse.json({
        answer: [
          `Top recomendações agora (${advice.length} regra(s) disparada(s)):`,
          ...advice
            .slice(0, 6)
            .map(
              (a, i) =>
                `${i + 1}. [${a.severity.toUpperCase()}] ${a.title}${a.metric ? ` — ${a.metric}` : ""}`,
            ),
        ].join("\n"),
      });
    }

    if (
      lower.includes("reembolso") &&
      (lower.includes("pendent") || lower.includes("deve"))
    ) {
      const balances = await computeBalancesLive();
      const credores = balances
        .filter((b) => b.status === "CREDOR")
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);
      return NextResponse.json({
        answer:
          credores.length === 0
            ? "Nenhum colaborador está com reembolso pendente no momento."
            : [
                "Top colaboradores com reembolso pendente (empresa deve):",
                ...credores.map(
                  (c, i) =>
                    `${i + 1}. ${c.teamMemberName} — ${fmtBRL(c.balance)} (${c.departmentName ?? "sem setor"})`,
                ),
              ].join("\n"),
      });
    }

    if (lower.includes("setor") && lower.includes("aprova")) {
      const reports = await getReports(
        { include: ["teamMember"], perPage: 500 },
        { revalidate: 120 },
      );
      const stats = computeApprovalTimeStats(reports);
      const slow = stats.byDepartment.filter((d) => d.averageHours / 24 >= 7);
      return NextResponse.json({
        answer:
          slow.length === 0
            ? "Nenhum setor está acima de 7 dias de tempo médio de aprovação."
            : [
                "Setores com tempo médio de aprovação ≥ 7 dias:",
                ...slow.map(
                  (d) =>
                    `• ${d.name} — ${fmtDuration(d.averageHours / 24)} (${d.count} relatórios)`,
                ),
              ].join("\n"),
      });
    }

    if (lower.includes("aguardando") || lower.includes("aprovar")) {
      const reports = await getReports(
        {
          status: ["ENVIADO", "REABERTO"],
          include: ["teamMember", "costsCenter"],
          perPage: 300,
        },
        { revalidate: 60 },
      );
      const above = reports
        .filter((r) => Number(r.total ?? 0) >= 5000)
        .sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0));
      return NextResponse.json({
        answer:
          above.length === 0
            ? "Não há relatórios acima de R$ 5.000 aguardando aprovação."
            : [
                `Relatórios ≥ R$ 5.000 aguardando aprovação (${above.length}):`,
                ...above
                  .slice(0, 15)
                  .map(
                    (r) =>
                      `#${r.id} · ${r.team_member?.name ?? "—"} · ${fmtBRL(r.total ?? 0)} · ${r.costs_center?.name ?? "sem CC"}`,
                  ),
              ].join("\n"),
      });
    }

    if (lower.includes("centro") || lower.includes("custo")) {
      const reports = await getReports(
        { include: ["costsCenter"], perPage: 500 },
        { revalidate: 120 },
      );
      const { computeTopCostsCenters } = await import("@/lib/analytics");
      const top = computeTopCostsCenters(reports, 5);
      return NextResponse.json({
        answer: [
          "Top centros de custo por valor:",
          ...top.map(
            (c, i) =>
              `${i + 1}. ${c.label} — ${fmtBRL(c.value)} em ${c.count} relatórios`,
          ),
        ].join("\n"),
      });
    }

    if (lower.includes("colabora") || lower.includes("top")) {
      const reports = await getReports(
        { include: ["teamMember"], perPage: 500 },
        { revalidate: 120 },
      );
      const top = computeTopMembers(reports, 5);
      return NextResponse.json({
        answer: [
          "Top colaboradores por valor movimentado:",
          ...top.map(
            (m, i) =>
              `${i + 1}. ${m.label} — ${fmtBRL(m.value)} em ${m.count} relatórios`,
          ),
        ].join("\n"),
      });
    }

    return NextResponse.json({
      answer:
        "Ainda não sei responder essa pergunta específica nesta versão. Tente uma das sugestões acima ou reformule mencionando 'reembolso', 'setor', 'aprovar', 'centro de custo' ou 'top colaboradores'.",
    });
  } catch (e) {
    return handleApiError(e);
  }
}
