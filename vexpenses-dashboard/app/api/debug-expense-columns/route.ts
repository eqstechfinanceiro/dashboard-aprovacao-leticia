import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  }

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'prestacao_expenses'
    ORDER BY ordinal_position
  `;

  return NextResponse.json({ columns: cols });
}
