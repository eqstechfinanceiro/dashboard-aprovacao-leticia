import { NextRequest, NextResponse } from 'next/server';
import { runPipeline, getCurrentQuinzenaId } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 3600; // 1 hour — full pipeline including download_expenses (~18 min for 7k HTTP requests)

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
