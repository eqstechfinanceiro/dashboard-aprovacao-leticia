import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vexpenses.com';
const API_KEY = process.env.VEXPENSES_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { report_id, approver_id, comment, expenses } = body;

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

    const payload: any = {
      approver: approver_id,
      comment: comment || 'Reprovado pelo bot de auditoria - violação da política corporativa',
    };

    if (expenses && typeof expenses === 'object') {
      payload.expenses = expenses;
    } else {
      payload.expenses = {};
    }

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
      console.error(`[Reject] API error ${response.status}:`, errorText);
      return NextResponse.json(
        { error: `API error ${response.status}: ${errorText.slice(0, 300)}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[Reject API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
