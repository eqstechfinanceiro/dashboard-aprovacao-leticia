import { NextRequest, NextResponse } from 'next/server';
import { snapshotSomase, getCurrentQuinzenaId } from '@/lib/pipeline';
import { recordStepStart, recordStepFinish, type PipelineStep } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — snapshot_somase with batch insert should be fast

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const quinzenaId = body.quinzena || getCurrentQuinzenaId();
    const step: PipelineStep = body.step || 'snapshot_somase';

    console.log(`[Pipeline Step] Running single step: ${step} for ${quinzenaId}`);

    const rowId = await recordStepStart(quinzenaId, step, 'manual');

    let meta: Record<string, unknown> = {};
    if (step === 'snapshot_somase') {
      meta = await snapshotSomase(quinzenaId);
    } else {
      return NextResponse.json(
        { error: `Step '${step}' not supported for individual execution` },
        { status: 400 }
      );
    }

    await recordStepFinish(rowId, 'success', null, meta);

    return NextResponse.json({
      quinzena: quinzenaId,
      step,
      success: true,
      meta,
    });
  } catch (error) {
    console.error('[Pipeline Step] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
