import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const nextDir = path.join(process.cwd(), '.next', 'server', 'app');
  
  let nextResultados: string[] = [];
  try {
    nextResultados = fs.readdirSync(nextDir).filter(f => f.includes('resultados'));
  } catch {}

  let tsxFiles = '';
  try {
    tsxFiles = fs.readFileSync(path.join(process.cwd(), 'tsx_files.txt'), 'utf-8');
  } catch (e) {
    tsxFiles = `Error reading: ${e}`;
  }

  return NextResponse.json({
    cwd: process.cwd(),
    nextResultados,
    tsxFiles,
  });
}

