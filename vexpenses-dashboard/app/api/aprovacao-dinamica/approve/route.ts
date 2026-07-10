import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { report_id, approver_id, approver_name, observation, comment } = body;

    if (!report_id) {
      return NextResponse.json(
        { error: 'report_id is required' },
        { status: 400 }
      );
    }

    if (!approver_id) {
      return NextResponse.json(
        { error: 'approver_id is required' },
        { status: 400 }
      );
    }

    const apiComment = comment || (observation ? `Aprovado via dashboard por ${approver_name || 'approver'}. Observação: ${observation}` : `Aprovado via dashboard por ${approver_name || 'approver'}`);

    // Fetch report expenses from VExpenses API to include in approve payload
    const expensesResponse = await fetch(
      `${API_URL}/v2/reports/${report_id}?include=expenses`,
      {
        headers: {
          'Authorization': API_KEY,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      }
    );

    let expensesPayload: Record<string, boolean> = {};
    if (expensesResponse.ok) {
      const expensesData = await expensesResponse.json();
      const expenses = expensesData.data?.expenses?.data || [];
      for (const exp of expenses) {
        expensesPayload[String(exp.id)] = true;
      }
    }

    const payload: any = {
      approver: approver_id,
      comment: apiComment,
      expenses: expensesPayload,
    };

    const response = await fetch(`${API_URL}/v2/reports/${report_id}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': API_KEY,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Approve] API error ${response.status}:`, errorText);
      return NextResponse.json(
        { error: `API error ${response.status}: ${errorText.slice(0, 500)}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (sql) {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS report_approvals (
            report_id INT PRIMARY KEY,
            approver_name TEXT,
            approver_user_id INT,
            observation TEXT,
            approved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `;
        await sql`
          INSERT INTO report_approvals (report_id, approver_name, approver_user_id, observation)
          VALUES (${report_id}, ${approver_name || 'unknown'}, ${approver_id}, ${observation || null})
          ON CONFLICT (report_id) DO UPDATE SET
            approver_name = EXCLUDED.approver_name,
            approver_user_id = EXCLUDED.approver_user_id,
            observation = EXCLUDED.observation,
            approved_at = NOW()
        `;
      } catch (dbErr) {
        console.error('[Approve] DB error (non-fatal):', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Approve API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
