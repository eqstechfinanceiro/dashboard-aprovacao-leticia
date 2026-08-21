import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const appDir = path.join(process.cwd(), 'app');
  const resultadosPath = path.join(appDir, 'resultados', 'page.tsx');
  const nextDir = path.join(process.cwd(), '.next', 'server', 'app');
  
  let nextResultados: string[] = [];
  try {
    nextResultados = fs.readdirSync(nextDir).filter(f => f.includes('resultados'));
  } catch {}

  return NextResponse.json({
    cwd: process.cwd(),
    resultadosExists: fs.existsSync(resultadosPath),
    resultadosPath,
    nextResultados,
    appDirExists: fs.existsSync(appDir),
  });
}
