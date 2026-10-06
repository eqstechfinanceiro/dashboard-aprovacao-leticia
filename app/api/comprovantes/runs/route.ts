import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { createRun, listRuns, ensureComprovantesTables } from '@/lib/comprovantes/db';
import { AUTH_COOKIE, verifyToken } from '@/lib/auth/auth';
import { SP_SITES } from '@/lib/comprovantes/sharepoint';
import { createHash } from 'crypto';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { uploadsRoot } from '@/lib/comprovantes/uploads';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  if (!sql) return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  const runs = await listRuns(50);
  return NextResponse.json({ runs });
}

export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'DB not available' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const { source = 'eqs', year, month, bank, date, files, mode, uploadId, competencia } = body;

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const session = token ? await verifyToken(token) : null;
  const email = session?.email || undefined;
  await ensureComprovantesTables();

  // Modo remessa: arquivos upados pelo usuário (PDFs de folha + TXTs CNAB).
  // Fase 'analise' — o worker só fragmenta/envia depois da confirmação.
  if (mode === 'remessa') {
    if (typeof uploadId !== 'string' || !/^[0-9a-z-]+$/i.test(uploadId)) {
      return NextResponse.json({ error: 'uploadId inválido' }, { status: 400 });
    }
    const dir = join(uploadsRoot(), uploadId);
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return NextResponse.json({ error: 'upload não encontrado' }, { status: 404 });
    }
    const remFiles = names.map((name) => ({
      name,
      kind: name.toUpperCase().endsWith('.PDF') ? 'pdf' : name.toUpperCase().endsWith('.TXT') ? 'txt' : 'outro',
      size: statSync(join(dir, name)).size,
    })).filter((f) => f.kind !== 'outro');
    if (!remFiles.some((f) => f.kind === 'pdf')) {
      return NextResponse.json({ error: 'upload sem PDF de folha' }, { status: 400 });
    }
    const sig = createHash('sha256')
      .update(remFiles.map((f) => `${f.name}:${f.size}`).sort().join('|'))
      .digest('hex').slice(0, 24);
    const dup = await sql`
      SELECT id, status FROM comprovantes_runs
      WHERE status IN ('queued','running','aguardando_confirmacao')
        AND selection IS NOT NULL AND selection->>'sig' = ${sig}
      LIMIT 1`;
    if (dup.length > 0) {
      return NextResponse.json({ runId: dup[0].id, deduplicated: true, status: dup[0].status });
    }
    const compSel = typeof competencia === 'string' && /^\d{2}\/\d{4}$/.test(competencia) ? competencia : undefined;
    const selection = { sig, dir, files: remFiles.map(({ name, kind }) => ({ name, kind })), phase: 'analise', competencia: compSel };
    const runId = await createRun({
      source: 'remessa',
      selection: selection as any,
      label: `Remessa folha · ${remFiles.filter((f) => f.kind === 'pdf').length} PDF + ${remFiles.filter((f) => f.kind === 'txt').length} TXT`,
      createdBy: email,
    });
    return NextResponse.json({ runId, deduplicated: false });
  }

  // Modo seleção: lista explícita de arquivos (pode misturar fontes/pastas)
  if (Array.isArray(files) && files.length > 0) {
    const valid = files.every((f: any) =>
      f && SP_SITES[f.source] && typeof f.url === 'string' && typeof f.name === 'string'
      && f.year && f.month && f.bank && f.date);
    if (!valid) return NextResponse.json({ error: 'files[] com itens inválidos' }, { status: 400 });

    const normalized = files.map((f: any) => ({
      source: f.source, year: f.year, month: f.month, bank: f.bank, date: f.date,
      url: f.url, name: f.name,
    }));
    const sig = JSON.stringify(normalized.map((f: any) => f.url).sort());
    // dedup: compara a assinatura de urls ordenadas
    const dup2 = await sql`
      SELECT id, status FROM comprovantes_runs
      WHERE status IN ('queued', 'running')
        AND selection IS NOT NULL
        AND selection->>'sig' = ${sig}
      LIMIT 1
    `;
    if (dup2.length > 0) {
      return NextResponse.json({ runId: dup2[0].id, deduplicated: true, status: dup2[0].status });
    }

    const label = `${normalized.length} arquivo${normalized.length > 1 ? 's' : ''} selecionado${normalized.length > 1 ? 's' : ''}`;
    const runId = await createRun({
      source: normalized[0].source,
      selection: { sig, items: normalized } as any,
      label, createdBy: email,
    });
    return NextResponse.json({ runId, deduplicated: false });
  }

  if (!SP_SITES[source]) return NextResponse.json({ error: 'source inválido' }, { status: 400 });
  if (!year || !month || !bank || !date) {
    return NextResponse.json({ error: 'year, month, bank, date são obrigatórios' }, { status: 400 });
  }

  const dup = await sql`
    SELECT id, status FROM comprovantes_runs
    WHERE source = ${source} AND year = ${year} AND month_folder = ${month}
      AND bank = ${bank} AND date_folder = ${date}
      AND status IN ('queued', 'running')
    LIMIT 1
  `;
  if (dup.length > 0) {
    return NextResponse.json({ runId: dup[0].id, deduplicated: true, status: dup[0].status });
  }

  const runId = await createRun({
    source, year, monthFolder: month, bank, dateFolder: date,
    label: `${source.toUpperCase()} · ${year}/${month}/${bank}/${date}`, createdBy: email,
  });
  return NextResponse.json({ runId, deduplicated: false });
}
