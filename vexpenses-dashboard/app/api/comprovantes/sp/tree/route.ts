import { NextRequest, NextResponse } from 'next/server';
import { SP_SITES, listFolders, listFiles, getSpStatus } from '@/lib/comprovantes/sharepoint';
import { getSpTreeCache, setSpTreeCache } from '@/lib/comprovantes/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// GET ?site=eqs|bratec&path=<relative or absolute path>
// Estratégia: tenta live sempre; em sucesso grava no cache; em falha serve o
// último snapshot cacheado (com flag `cached` + `cached_at` pra UI mostrar).
export async function GET(request: NextRequest) {
  const siteKey = request.nextUrl.searchParams.get('site') || 'eqs';
  const site = SP_SITES[siteKey];
  if (!site) return NextResponse.json({ error: 'site inválido' }, { status: 400 });

  const path = request.nextUrl.searchParams.get('path') || site.sourceBase;
  const collator = new Intl.Collator('pt-BR', { numeric: true });

  try {
    const [folders, files] = await Promise.all([listFolders(site, path), listFiles(site, path)]);
    folders.sort(collator.compare);
    files.sort((a, b) => collator.compare(a.name, b.name));
    // fire-and-forget — cache não pode atrasar a resposta
    setSpTreeCache(siteKey, path, folders, files).catch(() => {});
    return NextResponse.json({ path, folders, files, cached: false, sp: getSpStatus() });
  } catch (err) {
    const cached = await getSpTreeCache(siteKey, path).catch(() => null);
    if (cached) {
      const folders = [...cached.folders].sort(collator.compare);
      const files = [...cached.files].sort((a, b) => collator.compare(a.name, b.name));
      return NextResponse.json({
        path, folders, files,
        cached: true, cached_at: cached.fetched_at,
        warning: 'SharePoint indisponível — exibindo dados em cache',
        sp: getSpStatus(),
      });
    }
    return NextResponse.json({ error: String(err), sp: getSpStatus() }, { status: 500 });
  }
}
