// Notificação no Teams quando o fiscal confirma um erro real numa nota.
// GATE: só envia se FISCAL_TEAMS_WEBHOOK_URL estiver definido. Falha do
// webhook NUNCA falha a revisão.

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

export function isFiscalTeamsEnabled(): boolean {
  return !!process.env.FISCAL_TEAMS_WEBHOOK_URL;
}

function fmtBRL(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  // 'YYYY-MM-DD' puro parseia como UTC e vira dia anterior em BRT — tratar como data local
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-BR');
}

function fmtCNPJ(v: string | null): string {
  if (!v) return '';
  const d = v.replace(/\D/g, '');
  return d.length === 14
    ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    : v;
}

export function montarMensagemErroFiscal(nota: {
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
}, reviewer: string): string {
  const tipoLabel = nota.tipo === 'servico' ? 'Serviço' : 'Mercadoria';
  const erroLabel = ERRO_LABEL[nota.erro_tipo || ''] || nota.erro_tipo || 'Não especificado';

  return `**Nota fiscal com erro - ${tipoLabel} - NF ${nota.doc} · ${nota.fornecedor || 'fornecedor'}**

Uma nota fiscal teve um **erro confirmado**. Seguem os dados para tratativa:
- **Número:** ${nota.doc}${nota.serie ? ` (série ${nota.serie})` : ''}
- **Tipo:** ${tipoLabel}
- **Fornecedor:** ${nota.fornecedor || '—'}${nota.cnpj ? ` — CNPJ ${fmtCNPJ(nota.cnpj)}` : ''}
- **Filial:** ${nota.filial || '—'}
- **Emissão:** ${fmtDate(nota.emissao || null)}
- **Valor:** ${fmtBRL(nota.valor ?? null)}
${nota.chave_acesso ? `- **Chave de acesso:** ${nota.chave_acesso}\n` : ''}
**ERRO IDENTIFICADO**
- **Tipo:** ${erroLabel}
- **Conferido por:** ${reviewer}
${nota.erro_descricao ? `- **Detalhes:** ${nota.erro_descricao}\n` : ''}
*Aery — Conferência Fiscal · mensagem automática*`;
}

export async function enviarTeamsErroFiscal(nota: Parameters<typeof montarMensagemErroFiscal>[0], reviewer: string): Promise<void> {
  const url = process.env.FISCAL_TEAMS_WEBHOOK_URL;
  if (!url) return;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: montarMensagemErroFiscal(nota, reviewer) }),
  });
  if (!res.ok) {
    throw new Error(`Teams webhook HTTP ${res.status}`);
  }
}
