import { NextRequest, NextResponse } from 'next/server';
import { extractPdfText, parseAvisoText, brDateToIso } from '@/lib/cartorios/parse';
import { sql } from '@/lib/db/neon';
import { ensureCartorioTable } from '../route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Upload de PDF → extrai texto → parse → devolve DRAFT para revisão.
// Não salva nada: o usuário confirma/edita antes do POST /api/cartorios.
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 });
    if (!/pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Envie um arquivo PDF' }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'PDF maior que 15MB' }, { status: 400 });
    }

    const text = await extractPdfText(buf);
    if (!text || text.trim().length < 30) {
      return NextResponse.json({
        error: 'Não foi possível extrair texto do PDF (pode ser imagem escaneada)',
        draft: null,
      }, { status: 422 });
    }

    const parsed = parseAvisoText(text, file.name);

    // Deriva emolumentos quando o doc não discrimina (layout São José):
    // emolumentos = valor_doc - valor_orig - tarifa (boleto, default 2,50)
    let emolumentos = parsed.emolumentos;
    const tarifa = parsed.tarifa ?? 2.5;
    if (emolumentos === null && parsed.valor_doc !== null && parsed.valor_orig !== null) {
      const derivado = Math.round((parsed.valor_doc - parsed.valor_orig - tarifa) * 100) / 100;
      if (derivado > 0) emolumentos = derivado;
    }

    // Duplicata: já existe aviso com esse protocolo?
    let duplicate = false;
    if (parsed.protocolo && sql) {
      try {
        await ensureCartorioTable();
        const rows = await sql`
          SELECT id, fornecedor, valor_total, status FROM cartorio_avisos
          WHERE protocolo = ${parsed.protocolo} LIMIT 5
        `;
        if (rows.length) duplicate = true;
      } catch { /* ignora falha na checagem */ }
    }

    return NextResponse.json({
      draft: {
        empresa: parsed.empresa || 'EQS',
        protocolo: parsed.protocolo,
        recebimento: parsed.data_protocolo ? (brDateToIso(parsed.data_protocolo) ?? parsed.data_protocolo) : null,
        cnpj: parsed.fornecedor_cnpj, // CNPJ do credor/fornecedor extraído do PDF
        fornecedor: parsed.fornecedor,
        titulo: parsed.titulo,
        venc_titulo: brDateToIso(parsed.venc_titulo),
        venc_cartorio: brDateToIso(parsed.venc_cartorio),
        valor_orig: parsed.valor_orig,
        juros: 0,
        emolumentos,
        tarifa,
        valor_total: parsed.valor_doc,
        status: 'PENDENTE',
        responsavel: null,
        setor: null,
      },
      meta: {
        layout: parsed.layout,
        devedor_nome: parsed.devedor_nome,
        devedor_cnpj: parsed.devedor_cnpj,
        fornecedor_cnpj: parsed.fornecedor_cnpj,
        apresentante: parsed.apresentante,
        empresa_detectada: parsed.empresa,
      },
      duplicate,
      missing: [
        ...(!parsed.fornecedor ? ['fornecedor'] : []),
        ...(!parsed.protocolo ? ['protocolo'] : []),
        ...(!parsed.valor_orig ? ['valor_orig'] : []),
      ],
    });
  } catch (e) {
    console.error('[cartorios parse]', e);
    return NextResponse.json({ error: 'Erro ao processar PDF' }, { status: 500 });
  }
}
