import { NextRequest, NextResponse } from 'next/server';
import { runPipeline, getCurrentQuinzenaId } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — full 5-step pipeline

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const quinzenaId = body.quinzena || getCurrentQuinzenaId();
    const trigger = body.trigger || 'manual';

    console.log(`[Pipeline Run] Starting pipeline for ${quinzenaId} (${trigger})`);

    const result = await runPipeline(quinzenaId, trigger, (step, msg) => {
      console.log(`[Pipeline Run] ${step}: ${msg}`);
    });

    return NextResponse.json({
      quinzena: quinzenaId,
      success: result.success,
      results: result.results,
    });
  } catch (error) {
    console.error('[Pipeline Run] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
