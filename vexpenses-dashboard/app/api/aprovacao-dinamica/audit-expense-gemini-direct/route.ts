import { NextRequest, NextResponse } from 'next/server';
import { processReceiptGeminiDirect, isPdfUrl } from '@/lib/gemini-direct';
import { auditExpense, type ExpenseAuditResult } from '@/lib/audit-rules';
import { ensureAuditTable, saveAuditResult, getAuditResultsForReport } from '@/lib/audit-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const GEMINI_DIRECT_API_KEY = process.env.GEMINI_API_KEY || '';

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

    if (!GEMINI_DIRECT_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured' },
        { status: 500 }
      );
    }

    await ensureAuditTable();

    const existingResults = await getAuditResultsForReport(report_id);
    const existing = existingResults.find(r => r.expense_id === expense.id);

    if (existing && ['APROVADO_HUMANO', 'REPROVADO_HUMANO', 'ANALISAR_DEPOIS'].includes(existing.status)) {
      console.log(`[GeminiDirect] Expense ${expense.id} was human-reviewed (${existing.status}), skipping re-audit`);
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
        humanReviewed: true,
        provider: 'gemini-direct',
      });
    }

    if (existing && !force && existing.extracted_data) {
      console.log(`[GeminiDirect] Expense ${expense.id} already audited, returning cached result`);
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
        provider: 'gemini-direct',
      });
    }

    if (existing && !existing.extracted_data) {
      console.log(`[GeminiDirect] Expense ${expense.id} has cached failure, reprocessing...`);
    }

    console.log(`[GeminiDirect] Processing expense ${expense.id} (report ${report_id})`);

    let extractedData = null;
    let provider = 'gemini-direct';

    if (expense.receipt_url) {
      const isPdf = isPdfUrl(expense.receipt_url);
      console.log(`[GeminiDirect] ${isPdf ? 'PDF native' : 'Image'} - ${expense.receipt_url}`);

      const result = await processReceiptGeminiDirect(
        expense.receipt_url,
        GEMINI_DIRECT_API_KEY,
        5
      );

      if (result.success && result.structured_data) {
        extractedData = result.structured_data;
        console.log(`[GeminiDirect] Expense ${expense.id} succeeded - valor: ${extractedData.valor_total}, estab: ${extractedData.estabelecimento}`);
      } else {
        console.log(`[GeminiDirect] Expense ${expense.id} failed: ${result.error}`);
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
          audited_by: provider,
        });
      } catch (dbError) {
        console.error(`[GeminiDirect] DB save error for expense ${expense.id}:`, dbError);
      }
    } else {
      console.log(`[GeminiDirect] Expense ${expense.id} - OCR failed, saving as PENDENTE for manual review`);
      try {
        await saveAuditResult({
          report_id,
          expense_id: expense.id,
          status: result.status,
          extracted_data: null,
          informed_data: result.informed_data,
          divergences: result.divergences,
          rules_triggered: result.rules_triggered,
          summary: result.summary,
          audited_by: provider,
        });
      } catch (dbError) {
        console.error(`[GeminiDirect] DB save error for expense ${expense.id}:`, dbError);
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
      cached: false,
      provider,
    });
  } catch (error) {
    console.error('[GeminiDirect API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
