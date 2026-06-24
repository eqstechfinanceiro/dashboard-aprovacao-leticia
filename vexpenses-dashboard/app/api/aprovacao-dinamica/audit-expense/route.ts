import { NextRequest, NextResponse } from 'next/server';
import { processReceiptHybrid } from '@/lib/hybrid-ocr';
import { auditExpense, type ExpenseAuditResult } from '@/lib/audit-rules';
import { ensureAuditTable, saveAuditResult, getAuditResultsForReport } from '@/lib/audit-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { report_id, expense, force } = body;

    if (!report_id || !expense) {
      return NextResponse.json(
        { error: 'report_id and expense are required' },
        { status: 400 }
      );
    }

    if (!GEMINI_API_KEY && !GROQ_API_KEY && !OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'No OCR API key configured (need GEMINI_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY)' },
        { status: 500 }
      );
    }

    await ensureAuditTable();

    const existingResults = await getAuditResultsForReport(report_id);
    const existing = existingResults.find(r => r.expense_id === expense.id);

    if (existing && !force && existing.extracted_data) {
      console.log(`[Audit] Expense ${expense.id} already audited, returning cached result`);
      return NextResponse.json({
        success: true,
        data: {
          expense_id: existing.expense_id,
          status: existing.status,
          rules_triggered: existing.rules_triggered,
          extracted_data: existing.extracted_data,
          informed_data: existing.informed_data,
          divergences: existing.divergences,
          summary: existing.summary,
        } as ExpenseAuditResult,
        cached: true,
      });
    }

    if (existing && !existing.extracted_data) {
      console.log(`[Audit] Expense ${expense.id} has cached failure (no extracted_data), reprocessing...`);
    }

    console.log(`[Audit] Processing expense ${expense.id} (report ${report_id})`);

    let extractedData = null;
    let provider = 'none';

    if (expense.receipt_url) {
      const hybridResult = await processReceiptHybrid(
        expense.receipt_url,
        GROQ_API_KEY,
        GEMINI_API_KEY,
        OPENROUTER_API_KEY
      );

      if (hybridResult.success && hybridResult.structured_data) {
        extractedData = hybridResult.structured_data;
        provider = hybridResult.provider;
        console.log(`[Audit] Expense ${expense.id} processed by ${provider}`);
      } else if (hybridResult.provider === 'skipped') {
        console.log(`[Audit] Expense ${expense.id} skipped: ${hybridResult.error}`);
      } else {
        console.log(`[Audit] Both providers failed for expense ${expense.id}: ${hybridResult.error}`);
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

    if (extractedData) {
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
    } else {
      console.log(`[Audit] Expense ${expense.id} - OCR failed (${provider}), not saving to DB (will reprocess next time)`);
    }

    return NextResponse.json({
      success: true,
      data: result,
      cached: false,
    });
  } catch (error) {
    console.error('[Audit Expense API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
