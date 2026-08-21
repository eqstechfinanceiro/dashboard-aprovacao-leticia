import { NextRequest, NextResponse } from 'next/server';
import { processReceiptImage } from '@/lib/gemini';
import { auditExpense, summarizeReportAudit, type ReportAuditResult } from '@/lib/audit-rules';
import { ensureAuditTable, saveAuditResult } from '@/lib/audit-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { report_id, expenses } = body;

    if (!report_id || !expenses || !Array.isArray(expenses)) {
      return NextResponse.json(
        { error: 'report_id and expenses array are required' },
        { status: 400 }
      );
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured' },
        { status: 500 }
      );
    }

    await ensureAuditTable();

    const auditResults = [];

    for (const expense of expenses) {
      console.log(`[Audit] Processing expense ${expense.id} (report ${report_id})`);

      let extractedData = null;

      if (expense.receipt_url) {
        const geminiResult = await processReceiptImage(
          expense.receipt_url,
          GEMINI_API_KEY
        );

        if (geminiResult.success && geminiResult.structured_data) {
          extractedData = geminiResult.structured_data;
        } else {
          console.log(`[Audit] Gemini failed for expense ${expense.id}: ${geminiResult.error}`);
        }
      }

      const result = auditExpense(
        expense.id,
        extractedData,
        {
          value: expense.value,
          date: expense.date,
          title: expense.title || '',
          observation: expense.observation || '',
        }
      );

      auditResults.push(result);

      try {
        await saveAuditResult({
          report_id,
          expense_id: expense.id,
          status: result.status,
          extracted_data: result.extracted_data,
          informed_data: result.informed_data,
          divergences: result.divergences,
          rules_triggered: result.rules_triggered,
          summary: result.summary,
          audited_by: 'bot',
        });
      } catch (dbError) {
        console.error(`[Audit] DB save error for expense ${expense.id}:`, dbError);
      }
    }

    const reportSummary: ReportAuditResult = summarizeReportAudit(report_id, auditResults);

    return NextResponse.json({
      success: true,
      data: reportSummary,
    });
  } catch (error) {
    console.error('[Audit API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
