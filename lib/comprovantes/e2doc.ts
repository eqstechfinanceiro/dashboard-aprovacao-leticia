// Cliente E2DOC — port fiel de integradorE2DOC.py.
// GATE: nenhum envio real enquanto app_settings.e2doc_send_enabled !== true.
// Em dry-run, retorna sucesso simulado sem chamar nenhum endpoint de envio.

import { createHash, randomUUID } from 'crypto';
import { getSetting } from '../db/settings';

const API_BASE = process.env.E2DOC_API_BASE || 'https://api.e2doc.com.br';
const CHUNK_B64_SIZE = 4 * 1024 * 1024;

let cachedToken: string | null = null;

// Gate consultado por página — cache curto evita 1 query por comprovante.
let gateCache: { v: boolean; at: number } | null = null;
export async function isE2DocSendEnabled(): Promise<boolean> {
  if (gateCache && Date.now() - gateCache.at < 60_000) return gateCache.v;
  const v = (await getSetting<boolean>('e2doc_send_enabled')) === true;
  gateCache = { v, at: Date.now() };
  return v;
}

async function apiPost(endpoint: string, body: any): Promise<any> {
  const resp = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`E2DOC ${endpoint} → ${resp.status}: ${text.substring(0, 200)}`);
  }
  return resp.json().catch(() => ({}));
}

async function autenticar(): Promise<{ token: string; usuario: string }> {
  if (cachedToken) return { token: cachedToken, usuario: usuarioAtual() };
  const usuario = process.env.E2DOC_LOGIN;
  const senha = process.env.E2DOC_PASSWORD;
  const keybase = process.env.E2DOC_KEYBASE || 'EQS';
  if (!usuario || !senha) throw new Error('E2DOC_LOGIN/E2DOC_PASSWORD não configurados');

  const data = await apiPost('/Autentica/Usuario', {
    keybase, Usuario: usuario, Senha: senha, Modulo: 'sincronismo', Param: '', Versao: 20,
  });
  const token = String(data.AccessToken || '');
  if (!token) throw new Error('E2DOC auth sem AccessToken');
  cachedToken = token;
  return { token, usuario };
}

function usuarioAtual(): string {
  return process.env.E2DOC_LOGIN || '';
}

/** Consulta se já existe doc do modelo na pasta CPF+COMPETÊNCIA(+BANCO/PEDIDO).
 *  Usado pela dedup quando o arquivo já está no SharePoint mas o e2doc pode
 *  ter ficado de fora (falha numa run anterior). Erro de consulta → false
 *  (fail-open: o envio subsequente falha e marca e2doc_erro, recuperável). */
export async function existeNoE2Doc(args: {
  cpf: string;
  competencia: string;
  modeloDocumento: string;
  modeloPasta: EnvioE2Doc['modeloPasta'];
  banco?: string | null;
  pedido?: string | null;
}): Promise<boolean> {
  try {
    const { token } = await autenticar();
    const resp = await fetch(`${API_BASE}/Consulta/Consultar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        param: 'EstEc=9000',
        flags: '0',
        modelo: args.modeloPasta,
        indices: [{ label: 'CPF', operador: 'IGUAL', valor: args.cpf }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) return false;
    const data: any = await resp.json().catch(() => ({}));
    const idx = (p: any, label: string) =>
      String((p.indices || []).find((i: any) => i.label === label)?.valor || '').trim();
    for (const pasta of data.pastas || []) {
      if (idx(pasta, 'COMPETÊNCIA') !== args.competencia) continue;
      if (args.banco && idx(pasta, 'BANCO') && idx(pasta, 'BANCO') !== args.banco) continue;
      if (args.pedido && idx(pasta, 'PEDIDO') && idx(pasta, 'PEDIDO') !== args.pedido) continue;
      const docs = pasta.documentos || [];
      if (docs.some((d: any) => d.modelo === args.modeloDocumento && d.existeDoc)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export interface PastaE2Doc {
  indices: Record<string, string>;
  documentos: { modelo: string; existeDoc: boolean; id?: string }[];
}

/** Consulta as pastas do CPF na pasta-modelo — leitura usada p/ conferir o que
 *  realmente chegou no e2doc após um envio. */
export async function consultarPastasE2Doc(cpf: string, modeloPasta: EnvioE2Doc['modeloPasta']): Promise<PastaE2Doc[]> {
  const { token } = await autenticar();
  const resp = await fetch(`${API_BASE}/Consulta/Consultar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      param: 'EstEc=9000',
      flags: '0',
      modelo: modeloPasta,
      indices: [{ label: 'CPF', operador: 'IGUAL', valor: cpf }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) throw new Error(`E2DOC consulta → ${resp.status}`);
  const data: any = await resp.json().catch(() => ({}));
  return (data.pastas || []).map((p: any) => ({
    indices: Object.fromEntries((p.indices || []).map((i: any) => [i.label, String(i.valor || '').trim()])),
    documentos: (p.documentos || []).map((d: any) => ({
      modelo: d.modelo, existeDoc: !!d.existeDoc, id: d.id || d.idDocumento,
    })),
  }));
}

export interface EnvioE2Doc {
  cpf: string;
  nome: string;
  regiao: string;
  centroCusto: string;
  banco: string | null;
  competencia: string; // 'MM/YYYY'
  dataFormatada: string; // 'YYYY-MM-DD'
  modeloDocumento: string;
  modeloPasta: 'FINANCEIRO - DP' | 'FINANCEIRO - FROTA' | 'FINANCEIRO - BENEFICIOS';
  label: 'Comum' | 'Diferente';
  pedido?: string | null;
  pdfBuffer: Buffer;
}

export interface EnvioResult {
  ok: boolean;
  dryRun: boolean;
  protocolo?: string;
  error?: string;
}

export async function enviarComprovante(envio: EnvioE2Doc): Promise<EnvioResult> {
  const protocolo = randomUUID();
  const enabled = await isE2DocSendEnabled();
  if (!enabled) {
    return { ok: true, dryRun: true, protocolo };
  }

  try {
    const { token, usuario } = await autenticar();

    const indices = envio.label !== 'Comum'
      ? [
          { label: 'COMPETÊNCIA', valor: envio.competencia },
          { label: 'CPF', valor: envio.cpf },
          { label: 'NOME DO FUNCIONARIO', valor: envio.nome },
          { label: 'PEDIDO', valor: envio.pedido || '' },
          { label: 'BANCO', valor: envio.banco || '' },
          { label: 'SINDICATO', valor: '' },
          { label: 'CENTRO DE CUSTO', valor: envio.centroCusto },
        ]
      : [
          { label: 'COMPETÊNCIA', valor: envio.competencia },
          { label: 'CPF', valor: envio.cpf },
          { label: 'NOME DO FUNCIONARIO', valor: envio.nome },
          { label: 'PEDIDO', valor: envio.pedido || '' },
          { label: 'BANCO', valor: envio.banco || '' },
          { label: 'SINDICATO', valor: '' },
          { label: 'ESTADO', valor: '' },
          { label: 'REGIÃO', valor: envio.regiao },
          { label: 'CENTRO DE CUSTO', valor: envio.centroCusto },
        ];

    await apiPost('/Sincronismo/Iniciar', {
      token, usuario, protocolo, modeloPasta: envio.modeloPasta, indices,
    });

    const fileName = `${protocolo}_1_0.pdf`;
    const b64 = envio.pdfBuffer.toString('base64');
    for (let i = 0; i < b64.length; i += CHUNK_B64_SIZE) {
      await apiPost('/Sincronismo/EnviarParte', {
        token, fileNamePart: fileName, buffer: b64.substring(i, i + CHUNK_B64_SIZE),
      });
    }

    const hashMd5 = createHash('md5').update(envio.pdfBuffer).digest('hex');
    await apiPost('/Sincronismo/EnviarArquivo', {
      token,
      Documento: {
        modeloDocumento: envio.modeloDocumento,
        descricao: envio.modeloDocumento,
        usuario,
        data: envio.dataFormatada,
        partes: [fileName],
        path: '',
        hash: hashMd5,
        extensao: '.pdf',
        tamanho: envio.pdfBuffer.length,
        paginas: 1,
        sequencia: 1,
        versiona: 0,
      },
      ModeloPasta: envio.modeloPasta,
      protocolo,
    });

    await apiPost('/Sincronismo/Finalizar', { token, protocolo, flags: '' });

    return { ok: true, dryRun: false, protocolo };
  } catch (err) {
    cachedToken = null;
    return { ok: false, dryRun: false, protocolo, error: err instanceof Error ? err.message : String(err) };
  }
}
