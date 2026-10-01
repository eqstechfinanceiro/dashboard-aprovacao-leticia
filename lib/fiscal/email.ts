// E-mail informacional quando o fiscal confirma um erro real numa nota.
// GATE: só envia se FISCAL_ERRO_EMAIL_TO estiver definido E SMTP_HOST/
// SMTP_USER/SMTP_PASS configurados. Falha de e-mail NUNCA falha a revisão.

import nodemailer from 'nodemailer';

const ERRO_LABEL: Record<string, string> = {
  tes_errado: 'TES errada',
  imposto_errado: 'Imposto errado (ICMS/IPI/ST/ISS/IRR)',
  valor_errado: 'Valor errado',
  doc_invalido: 'Documento inválido',
  fornecedor_errado: 'Fornecedor errado',
  tipo_errado: 'Tipo errado',
  sem_documento: 'Sem documento (XML/PDF)',
  outro: 'Outro',
};

export function isFiscalEmailEnabled(): boolean {
  return !!(
    process.env.FISCAL_ERRO_EMAIL_TO &&
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

function fmtBRL(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-BR');
}

export async function enviarEmailErroFiscal(nota: {
  doc: string;
  serie?: string | null;
  filial?: string | null;
  fornecedor?: string | null;
  cnpj?: string | null;
  valor?: number | null;
  emissao?: string | null;
  chave_acesso?: string | null;
  tipo?: string;
  erro_tipo?: string | null;
  erro_descricao?: string | null;
}, reviewer: string): Promise<void> {
  if (!isFiscalEmailEnabled()) return;

  const tipoLabel = nota.tipo === 'servico' ? 'Serviço' : 'Mercadoria';
  const erroLabel = ERRO_LABEL[nota.erro_tipo || ''] || nota.erro_tipo || 'Não especificado';

  const corpo = `Olá!

Uma nota fiscal foi conferida pelo setor fiscal e teve um erro confirmado. Seguem os dados para tratativa:

NOTA FISCAL
 - Número: ${nota.doc}${nota.serie ? ` (série ${nota.serie})` : ''}
 - Tipo: ${tipoLabel}
 - Fornecedor: ${nota.fornecedor || '—'}${nota.cnpj ? ` — CNPJ ${nota.cnpj}` : ''}
 - Filial: ${nota.filial || '—'}
 - Emissão: ${fmtDate(nota.emissao || null)}
 - Valor: ${fmtBRL(nota.valor ?? null)}
${nota.chave_acesso ? ` - Chave de acesso: ${nota.chave_acesso}\n` : ''}
ERRO IDENTIFICADO
 - Tipo: ${erroLabel}
${nota.erro_descricao ? ` - Detalhes: ${nota.erro_descricao}\n` : ''}
Conferido por: ${reviewer}

Os detalhes completos da divergência e o documento da nota estão disponíveis no portal Aery, em Fiscal → Histórico.

Atenciosamente,
Aery — Conferência Fiscal`;

  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const destinatarios = (process.env.FISCAL_ERRO_EMAIL_TO || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (destinatarios.length === 0) return;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: destinatarios.join(', '),
    subject: `Erro confirmado na conferência fiscal — NF ${nota.doc} · ${nota.fornecedor || 'fornecedor'}`,
    text: corpo,
  });
}
