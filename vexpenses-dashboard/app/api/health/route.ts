import { NextResponse } from 'next/server';
import { getSystemHealth } from '@/lib/vexpenses-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const health = await getSystemHealth();
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      ...health,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
