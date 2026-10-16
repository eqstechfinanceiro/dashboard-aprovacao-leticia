import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

let cachedBuildId: string | null = null;

/**
 * Expõe o BUILD_ID do deploy atual. O client (VersionChecker) faz poll e
 * força reload quando muda — cobre usuários com a aba aberta há dias.
 */
export function GET() {
  if (!cachedBuildId) {
    try {
      cachedBuildId = readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
    } catch {
      cachedBuildId = `dev-${process.pid}`;
    }
  }
  return NextResponse.json(
    { v: cachedBuildId },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  );
}
