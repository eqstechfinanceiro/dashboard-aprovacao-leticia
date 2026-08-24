import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { downloadExtrato } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json(
      { error: 'Parâmetro userId é obrigatório' },
      { status: 400 }
    );
  }

  if (!API_KEY) {
    return NextResponse.json(
      { error: 'VEXPENSES_API_KEY não configurada' },
      { status: 500 }
    );
  }

  const headers: Record<string, string> = {
    'Authorization': API_KEY,
    'Accept': 'application/json',
  };

  // Use SSE for progress updates
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (step: string, current: number, total: number) => {
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        const data = JSON.stringify({ step, current, total, percent });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      try {
        // 0. Download extrato from VExpenses API v3
        sendProgress('Baixando extrato...', 0, 1);
        let extratoSynced = 0;
        let extratoError: string | null = null;
        try {
          const extratoResult = await downloadExtrato(
            (chunk, totalChunks) => sendProgress('Baixando extrato...', chunk, totalChunks),
            { incremental: true }
          );
          extratoSynced = (extratoResult.totalRows as number) || 0;
        } catch (e: any) {
          console.error('[Sync] Extrato download failed:', e);
          extratoError = e.message || 'Erro ao baixar extrato';
        }
        sendProgress('Extrato concluído', 1, 1);

        // 1. Fetch all reports from VExpenses API
        sendProgress('Buscando relatórios...', 0, 1);
        const reportsResp = await fetch(
          `${API_URL}/v2/reports?include=user`,
          { headers }
        );

        if (!reportsResp.ok) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `Erro ao buscar relatórios: ${reportsResp.status}` })}\n\n`));
          controller.close();
          return;
        }

        const reportsJson = await reportsResp.json();
        const allApiReports: any[] = reportsJson.data || [];

        // Filter reports for this user
        const targetUserId = parseInt(userId, 10);
        const allReports = allApiReports.filter((r: any) => {
          const user = r.user?.data || r.user || {};
          return user.id === targetUserId;
        });

        sendProgress('Relatórios filtrados', 1, 1);

        // 2. Fetch expenses for all reports in parallel batches
        const reportIds = allReports.map(r => r.id);
        const totalReportBatches = Math.ceil(reportIds.length / 5);
        let batchIdx = 0;

        const fetched: { report: any; expenses: any[] }[] = [];
        for (let i = 0; i < reportIds.length; i += 5) {
          const batch = reportIds.slice(i, i + 5);
          batchIdx++;
          sendProgress(`Buscando despesas (${batchIdx}/${totalReportBatches})`, batchIdx, totalReportBatches);
          const batchResults = await Promise.all(
            batch.map(async (rid) => {
              try {
                const resp = await fetch(
                  `${API_URL}/v2/reports/${rid}?include=expenses.user`,
                  { headers }
                );
                if (!resp.ok) return { report: null, expenses: [] };
                const json = await resp.json();
                const data = json.data || json;
                const expenses = data?.expenses?.data || [];
                return { report: data, expenses };
              } catch {
                return { report: null, expenses: [] };
              }
            })
          );
          fetched.push(...batchResults);
        }

        let totalExpenses = 0;
        let totalReports = 0;

        // 3. Upsert reports and expenses into Neon DB
        if (sql) {
          for (let i = 0; i < allReports.length; i++) {
            sendProgress(`Salvando no banco (${i + 1}/${allReports.length})`, i + 1, allReports.length);
            const report = allReports[i];
            const reportId = report.id;
            const { report: reportData, expenses } = fetched[i];

            if (!reportData) continue;

            const userData = reportData?.user?.data || report.user?.data || {};
            try {
              await sql`
                INSERT INTO prestacao_reports (id, name, status, user_id, user_cpf, user_name, total_value, created_at)
                VALUES (
                  ${reportId},
                  ${report.name || report.description || ''},
                  ${report.status || ''},
                  ${parseInt(userId, 10)},
                  ${userData.cpf || ''},
                  ${userData.name || ''},
                  ${reportData?.total_value || report.total_value || 0},
                  ${report.created_at || new Date().toISOString()}
                )
                ON CONFLICT (id) DO UPDATE SET
                  name = EXCLUDED.name,
                  status = EXCLUDED.status,
                  user_cpf = EXCLUDED.user_cpf,
                  user_name = EXCLUDED.user_name,
                  total_value = EXCLUDED.total_value
              `;
              totalReports++;
            } catch (e) {
              console.error(`[Sync] Error upserting report ${reportId}:`, e);
            }

            for (const exp of expenses) {
              const val = parseFloat(exp.value) || 0;
              const conv = exp.converted_value != null ? parseFloat(exp.converted_value) : val;

              try {
                await sql`
                  INSERT INTO prestacao_expenses (id, report_id, value, date, description, status, raw_data)
                  VALUES (
                    ${exp.id},
                    ${reportId},
                    ${val},
                    ${exp.date || null},
                    ${exp.description || exp.title || ''},
                    ${report.status || ''},
                    ${JSON.stringify(exp)}::jsonb
                  )
                  ON CONFLICT (id) DO UPDATE SET
                    report_id = EXCLUDED.report_id,
                    value = EXCLUDED.value,
                    date = EXCLUDED.date,
                    description = EXCLUDED.description,
                    status = EXCLUDED.status,
                    raw_data = EXCLUDED.raw_data
                `;
                totalExpenses++;
              } catch (e) {
                console.error(`[Sync] Error upserting expense ${exp.id}:`, e);
              }
            }
          }

          // 4. Record sync timestamp
          try {
            await sql`
              INSERT INTO sync_log (user_id, synced_at, reports_synced, expenses_synced)
              VALUES (${parseInt(userId, 10)}, NOW(), ${totalReports}, ${totalExpenses})
              ON CONFLICT (user_id) DO UPDATE SET
                synced_at = NOW(),
                reports_synced = EXCLUDED.reports_synced,
                expenses_synced = EXCLUDED.expenses_synced
            `;
          } catch (e) {
            try {
              await sql`
                CREATE TABLE IF NOT EXISTS sync_log (
                  user_id INTEGER PRIMARY KEY,
                  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  reports_synced INTEGER DEFAULT 0,
                  expenses_synced INTEGER DEFAULT 0
                )
              `;
              await sql`
                INSERT INTO sync_log (user_id, synced_at, reports_synced, expenses_synced)
                VALUES (${parseInt(userId, 10)}, NOW(), ${totalReports}, ${totalExpenses})
                ON CONFLICT (user_id) DO UPDATE SET
                  synced_at = NOW(),
                  reports_synced = EXCLUDED.reports_synced,
                  expenses_synced = EXCLUDED.expenses_synced
              `;
            } catch (e2) {
              console.error('[Sync] Error recording sync timestamp:', e2);
            }
          }
        }

        // Final event
        const result = {
          done: true,
          reportsSynced: totalReports,
          expensesSynced: totalExpenses,
          extratoSynced,
          extratoError,
          syncedAt: new Date().toISOString(),
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(result)}\n\n`));
        controller.close();
      } catch (error: any) {
        console.error('[Sync] Error:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message || 'Erro interno ao sincronizar' })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json(
      { error: 'Parâmetro userId é obrigatório' },
      { status: 400 }
    );
  }

  if (!sql) {
    return NextResponse.json({ syncedAt: null });
  }

  try {
    const rows = await sql`
      SELECT synced_at FROM sync_log WHERE user_id = ${parseInt(userId, 10)}
    `;

    if (rows.length > 0) {
      return NextResponse.json({ syncedAt: (rows[0] as any).synced_at });
    }

    return NextResponse.json({ syncedAt: null });
  } catch (e) {
    // Table might not exist
    return NextResponse.json({ syncedAt: null });
  }
}
