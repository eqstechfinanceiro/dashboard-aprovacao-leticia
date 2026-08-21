import { NextRequest, NextResponse } from 'next/server';
import { getLatestStepStatuses, getCurrentQuinzenaId, isPipelineComplete } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const quinzenaId = searchParams.get('quinzena') || getCurrentQuinzenaId();

    const steps = await getLatestStepStatuses(quinzenaId);
    const complete = await isPipelineComplete(quinzenaId);

    const stepMap: Record<string, { status: string; started_at: string | null; finished_at: string | null; error: string | null }> = {};
    for (const s of steps) {
      stepMap[s.step] = {
        status: s.status,
        started_at: s.started_at,
        finished_at: s.finished_at,
        error: s.error,
      };
    }

    return NextResponse.json({
      quinzena: quinzenaId,
      complete,
      steps: stepMap,
      current_quinzena: getCurrentQuinzenaId(),
    });
  } catch (error) {
    console.error('[Pipeline Status] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
