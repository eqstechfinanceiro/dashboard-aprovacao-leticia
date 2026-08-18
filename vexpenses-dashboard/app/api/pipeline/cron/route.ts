import { NextRequest, NextResponse } from 'next/server';
import { runPipeline, getCurrentQuinzenaId, isPipelineComplete, getLatestStepStatuses } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron endpoint for automatic pipeline execution.
 * Called by external cron (Railway cron, cron-job.org, etc.) on days 10 and 25.
 *
 * Security: requires CRON_SECRET env var to match header.
 *
 * Usage with cron-job.org or similar:
 *   GET /api/pipeline/cron
 *   Headers: { x-cron-secret: <CRON_SECRET> }
 *
 * Schedule: 0 2 10,25 * *  (2 AM on days 10 and 25)
 * The 2 AM delay ensures the previous quinzena is truly closed.
 */
export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const provided = request.headers.get('x-cron-secret') ||
                       new URL(request.url).searchParams.get('secret');
      if (provided !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const quinzenaId = getCurrentQuinzenaId();
    console.log(`[Pipeline Cron] Checking quinzena ${quinzenaId}`);

    // Check if already complete
    const alreadyComplete = await isPipelineComplete(quinzenaId);
    if (alreadyComplete) {
      const steps = await getLatestStepStatuses(quinzenaId);
      return NextResponse.json({
        quinzena: quinzenaId,
        skipped: true,
        reason: 'Pipeline already complete for this quinzena',
        steps: steps.map(s => ({ step: s.step, status: s.status })),
      });
    }

    // Run the pipeline
    console.log(`[Pipeline Cron] Running pipeline for ${quinzenaId}`);
    const result = await runPipeline(quinzenaId, 'auto', (step, msg) => {
      console.log(`[Pipeline Cron] ${step}: ${msg}`);
    });

    return NextResponse.json({
      quinzena: quinzenaId,
      success: result.success,
      results: result.results,
      trigger: 'auto',
    });
  } catch (error) {
    console.error('[Pipeline Cron] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
