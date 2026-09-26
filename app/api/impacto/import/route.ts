import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/neon';
import { ensureImpactoTables } from '@/lib/impacto/totvs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const s = (v: any) => (v === null || v === undefined ? null : String(v).trim() || null);
// Excel legado tem surrogate solto em 'LOGÍSTICA' (byte Latin-1 mal convertido)
const fixSetor = (v: any) => {
  const t = s(v);
  if (!t) return t;
  const clean = t.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  return /^LOG.STICA$|^LOGSTICA$/i.test(clean) || /^LOG.?STICA$/i.test(clean) ? 'LOGÍSTICA' : clean;
};
const toDate = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const str = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(str) ? str.slice(0, 10) : null;
};

// POST /api/impacto/import — recebe a BASE Excel legada (body = arquivo .xlsx)
// e preenche validacao/observacao/setor/gestor nos títulos já sincronizados.
// Não sobrescreve campos já preenchidos (COALESCE mantém o existente).
export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco não configurado' }, { status: 503 });
  try {
    await ensureImpactoTables();
    const buf = Buffer.from(await request.arrayBuffer());
    if (buf.length < 100 || buf.length > 60 * 1024 * 1024) {
      return NextResponse.json({ error: 'arquivo inválido' }, { status: 400 });
    }
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'buffer' });
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: true });

    let matched = 0, missing = 0, ambiguous = 0, skipped = 0, inserted = 0;
    const missingSample: string[] = [];
    for (const r of rows) {
      const empresa = s(r['Empresa'])?.toUpperCase();
      const num = s(r['No. Titulo']);
      const cod = s(r['Codigo']);
      const baixa = toDate(r['DT Baixa']);
      if (!empresa || !num || !cod) { skipped++; continue; }

      // 1ª tentativa: empresa+num+fornecedor (+baixa se houver); 2ª: sem baixa
      let cand = await sql.query(
        `SELECT id FROM impacto_titulos
         WHERE empresa=$1 AND num=$2 AND fornecedor=$3
           AND ($4::date IS NULL OR baixa=$4)`,
        [empresa, num, cod, baixa]
      );
      if (!cand.rows.length && baixa) {
        cand = await sql.query(
          `SELECT id FROM impacto_titulos WHERE empresa=$1 AND num=$2 AND fornecedor=$3 LIMIT 2`,
          [empresa, num, cod]
        );
      }
      if (!cand.rows.length) {
        // título não existe na SE2 (legado/outra origem) — insere da planilha
        // para não perder a classificação manual histórica
        missing++;
        if (missingSample.length < 20) missingSample.push(`${empresa}/${num}/${cod}/${baixa}`);
        try {
          await sql.query(
            `INSERT INTO impacto_titulos (
               empresa, num, fornecedor, fornecedor_nome, tipo, parcela,
               natureza, natureza_desc, ccusto, ccusto_desc,
               emissao, vencto_real, baixa, valor, multa, juros, acresc,
               validacao, observacao, setor, gestor, origem
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'BASE-EXCEL')
             ON CONFLICT DO NOTHING`,
            [
              empresa, num, cod, s(r['Fornecedor']), s(r['Tipo']), s(r['Parcela']),
              s(r['Natureza']), s(r['Descrição Nat']), s(r['Centro Custo']), s(r['Descrição CC']),
              toDate(r['DT Emissao']), toDate(r['Vencto Real']), baixa,
              Number(r['Valor']) || 0, Number(r['Multa']) || 0, Number(r['Juros']) || 0,
              Number(r['Acresc.']) || 0,
              s(r['Validação '] ?? r['Validação']), s(r['Observação'] ?? r['Observacao']),
              fixSetor(r['Setor']), s(r['Gestor']),
            ]
          );
          inserted++;
        } catch { /* duplicata ou dado inválido */ }
        continue;
      }
      if (cand.rows.length > 1) ambiguous++;
      await sql.query(
        `UPDATE impacto_titulos SET
           validacao = COALESCE($2, validacao),
           observacao = COALESCE($3, observacao),
           setor = COALESCE($4, setor),
           gestor = COALESCE($5, gestor)
         WHERE id = $1`,
        [cand.rows[0].id, s(r['Validação '] ?? r['Validação']), s(r['Observação'] ?? r['Observacao']), fixSetor(r['Setor']), s(r['Gestor'])]
      );
      matched++;
    }
    // normaliza o 'LOGÍSTICA' corrompido gravado em imports anteriores
    await sql.query(
      `UPDATE impacto_titulos SET setor='LOGÍSTICA' WHERE setor LIKE 'LOG%STICA' AND setor <> 'LOGÍSTICA'`
    );
    return NextResponse.json({ ok: true, total: rows.length, matched, ambiguous, missing, inserted, skipped, missingSample });
  } catch (e: any) {
    console.error('[impacto import]', e);
    return NextResponse.json({ error: e?.message || 'Erro ao importar' }, { status: 500 });
  }
}
