import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { sql } from '@/lib/db/neon';
import { ensureFiscalTables, ERRO_TIPOS, FISCAL_TIPOS } from '@/lib/fiscal/fiscal-db';
import { enviarTeamsErroFiscal } from '@/lib/fiscal/teams';
import { logAudit } from '@/lib/db/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DOCS_DIR = path.join(process.cwd(), 'private-downloads', 'fiscal');
const DOC_MAX_BYTES = 8 * 1024 * 1024;

// POST /api/fiscal/importar-xml  (multipart/form-data)
// Campos: file (XML da NF-e ou PDF de NFS), motivo (obrigatório),
//         erro_tipo?, tipo?, doc?, fornecedor?, cnpj?, valor?, emissao?
//
// Registro manual de nota errada pelo fiscal. XML de NF-e tem os campos
// extraídos automaticamente; PDF de nota de serviço não é parseável — nesse
// caso os campos informados manualmente no form são usados (doc obrigatório).
// A nota entra como confirmado_erro (vai pro Histórico e dispara o Teams).
//
// Se a nota já existir (mesma dedup da importação automática), a revisão
// humana é aplicada sobre a linha existente.

function tag(xml: string, t: string): string {
  const m = xml.match(new RegExp(`<${t}>([^<]*)</${t}>`));
  return m ? m[1].trim() : '';
}

function section(xml: string, t: string): string {
  const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));
  return m ? m[1] : '';
}

export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Form-data inválido' }, { status: 400 });
  }

  const file = form.get('file');
  const motivo = String(form.get('motivo') || '').trim().slice(0, 500);
  const erroTipoForm = String(form.get('erro_tipo') || 'outro');
  const tipoForm = String(form.get('tipo') || 'mercadoria');

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Arquivo da nota obrigatório (XML ou PDF)' }, { status: 400 });
  }
  if (file.size > DOC_MAX_BYTES) {
    return NextResponse.json({ error: 'Arquivo maior que 8MB' }, { status: 400 });
  }
  if (!motivo) {
    return NextResponse.json({ error: 'Motivo do erro obrigatório' }, { status: 400 });
  }
  const erroTipo = ERRO_TIPOS.includes(erroTipoForm as any) ? erroTipoForm : 'outro';
  const tipo = FISCAL_TIPOS.includes(tipoForm as any) ? tipoForm : 'mercadoria';

  const isPdf = /\.pdf$/i.test(file.name || '') || file.type === 'application/pdf';

  // Campos manuais — usados quando o arquivo não é NF-e parseável (PDF de NFS).
  const m = (k: string) => String(form.get(k) || '').trim() || null;
  const manualDoc = m('doc');
  const manualEmissao = m('emissao');
  const manualValor = parseFloat(String(form.get('valor') || '').replace(',', '.'));

  let dados: {
    doc: string; serie: string | null; filial: string | null;
    fornecedor: string | null; cnpj: string | null; valor: number | null;
    emissao: string | null; chave_acesso: string | null;
  };

  if (isPdf) {
    if (!manualDoc) {
      return NextResponse.json(
        { error: 'Informe o número da nota (PDF não é parseável)' },
        { status: 400 }
      );
    }
    dados = {
      doc: manualDoc.slice(0, 60),
      serie: m('serie'),
      filial: m('filial'),
      fornecedor: m('fornecedor'),
      cnpj: (m('cnpj') || '').replace(/\D/g, '') || null,
      valor: Number.isFinite(manualValor) ? manualValor : null,
      emissao: manualEmissao && /^\d{4}-\d{2}-\d{2}/.test(manualEmissao) ? manualEmissao.slice(0, 10) : null,
      chave_acesso: null,
    };
  } else {
    const xmlText = await file.text();
    const ide = section(xmlText, 'ide');
    const emit = section(xmlText, 'emit');
    const tot = section(xmlText, 'ICMSTot');
    const chaveMatch = xmlText.match(/Id="NFe(\d{44})"/) || xmlText.match(/<chNFe>(\d{44})<\/chNFe>/);

    const doc = tag(ide, 'nNF');
    if (!doc) {
      return NextResponse.json(
        { error: 'XML não parece uma NF-e (campo nNF não encontrado). Se for PDF de serviço, informe o número da nota.' },
        { status: 400 }
      );
    }

    const emissaoRaw = tag(ide, 'dhEmi') || tag(ide, 'dEmi');
    const emissao = /^\d{4}-\d{2}-\d{2}/.test(emissaoRaw) ? emissaoRaw.slice(0, 10) : null;
    const valor = parseFloat(tag(tot, 'vNF'));
    dados = {
      doc: doc.slice(0, 60),
      serie: tag(ide, 'serie') || null,
      filial: null,
      fornecedor: tag(emit, 'xNome') || null,
      cnpj: (tag(emit, 'CNPJ') || tag(emit, 'CPF') || '').replace(/\D/g, '') || null,
      valor: Number.isFinite(valor) ? valor : null,
      emissao,
      chave_acesso: chaveMatch ? chaveMatch[1] : null,
    };
  }

  const reviewer =
    request.headers.get('x-user-name') ||
    request.headers.get('x-user-email') ||
    'desconhecido';

  await ensureFiscalTables();

  // Upsert na mesma chave de dedup da importação automática — se a nota já
  // estava na fila, a decisão humana é aplicada nela em vez de duplicar.
  const res = await sql`
    INSERT INTO fiscal_notas
      (tipo, doc, serie, filial, fornecedor, cnpj, valor, emissao, chave_acesso,
       auto_status, auto_resumo, checks, review_status,
       reviewed_by, reviewed_at, erro_tipo, erro_descricao)
    VALUES
      (${tipo}, ${dados.doc}, ${dados.serie}, ${dados.filial}, ${dados.fornecedor},
       ${dados.cnpj}, ${dados.valor}, ${dados.emissao}, ${dados.chave_acesso},
       'divergente', ${'Registrada manualmente pelo fiscal: ' + motivo}, NULL,
       'confirmado_erro', ${reviewer}, NOW(), ${erroTipo}, ${motivo})
    ON CONFLICT (tipo, doc, COALESCE(serie, ''), COALESCE(filial, ''), COALESCE(emissao, '1900-01-01'::date), COALESCE(fornecedor, '')) DO UPDATE SET
      cnpj = COALESCE(EXCLUDED.cnpj, fiscal_notas.cnpj),
      valor = COALESCE(EXCLUDED.valor, fiscal_notas.valor),
      chave_acesso = COALESCE(EXCLUDED.chave_acesso, fiscal_notas.chave_acesso),
      review_status = 'confirmado_erro',
      reviewed_by = EXCLUDED.reviewed_by,
      reviewed_at = NOW(),
      erro_tipo = EXCLUDED.erro_tipo,
      erro_descricao = EXCLUDED.erro_descricao,
      cancelled_by = NULL,
      cancelled_at = NULL,
      cancel_motivo = NULL,
      updated_at = NOW()
    RETURNING id, review_status, resultados_id
  `;
  const nota = res[0];

  // Registro na aba de erros (mesmo comportamento do /revisar).
  let resultadosId: number | null = nota.resultados_id;
  if (!resultadosId) {
    const titulo = `NF ${dados.doc} - ${dados.fornecedor || 'fornecedor'} - ${motivo}`.slice(0, 400);
    const ins = await sql`
      INSERT INTO resultados_conferencias (titulo, tipo, erro, valor, data, fonte)
      VALUES (${titulo}, ${tipo}, ${erroTipo}, ${dados.valor ?? 0},
              ${dados.emissao ?? new Date().toISOString().slice(0, 10)}, 'fiscal')
      RETURNING id
    `;
    resultadosId = ins[0].id;
    await sql`UPDATE fiscal_notas SET resultados_id = ${resultadosId} WHERE id = ${nota.id}`;
  }

  // Guarda o documento (XML ou PDF) como evidência da nota no histórico.
  try {
    mkdirSync(DOCS_DIR, { recursive: true });
    const safe = path.basename(file.name || `nota.${isPdf ? 'pdf' : 'xml'}`).replace(/[^\w.\-]/g, '_');
    const fname = `${nota.id}_${safe}`;
    writeFileSync(path.join(DOCS_DIR, fname), Buffer.from(await file.arrayBuffer()));
    await sql`UPDATE fiscal_notas SET doc_path = ${`fiscal/${fname}`}, doc_nome = ${safe} WHERE id = ${nota.id}`;
  } catch (e) {
    console.error('[fiscal/importar-xml] falha ao salvar documento:', e);
  }

  await logAudit(request, {
    action: 'fiscal.importar_xml',
    entity_type: 'fiscal_nota',
    entity_id: nota.id,
    details: { doc: dados.doc, fornecedor: dados.fornecedor, motivo, erro_tipo: erroTipo, tipo, resultados_id: resultadosId },
  });

  enviarTeamsErroFiscal(
    { ...dados, tipo, erro_tipo: erroTipo, erro_descricao: motivo },
    reviewer
  ).catch((e) => console.error('[Fiscal] envio ao Teams falhou:', e?.message || e));

  return NextResponse.json({ ok: true, nota_id: nota.id, doc: dados.doc });
}
