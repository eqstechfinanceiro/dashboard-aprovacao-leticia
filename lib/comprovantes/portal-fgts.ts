/**
 * Resolução de comprovantes FGTS via portal EQS.
 *
 * Guias FGTS pagas por PIX QR trafegam no portal como processos de pagamento
 * (docs CBME**), cada um com a guia GFD anexada no portal antigo (Django):
 *   - FGTSRESCISRIO/RELATRIOFGTS.pdf → guia: nº, Total da Guia, vencimento e o
 *     hash `cobv/...` do PIX Copia e Cola (o mesmo hash do urlQr do J52 da
 *     remessa) — chave determinística remessa↔processo.
 *   - RELATRIOFGTS.pdf → relação de trabalhadores (nome, CPF, matrícula e
 *     decomposição por competência/tipo de depósito).
 *
 * Casos resolvidos:
 *   - 'sem_par_txt' (comprovante pago fora da remessa): casa por
 *     valor+vencimento contra os processos do portal; a guia confirma o total
 *     e identifica o trabalhador.
 *   - 'valor_ambiguo' (2+ entradas .rem com mesmo valor+data): o cobv do urlQr
 *     da entrada pareada localiza a guia — confirmando funcionário por CPF.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db/neon';
import { eqsListProcpag, eqsPortalConfigured } from '../fiscal/eqs-portal';
import { oldPortalSession, oldPortalListDocs, oldPortalDownload, type PortalDocItem } from '../fiscal/servico-docs';
import { listAllFuncionarios, type Funcionario } from './funcionarios';

const TENANT = '02,02';
const GUIA_MAX_BYTES = 12 * 1024 * 1024;
const VALOR_TOL_CENTS = 2; // ±R$0,02

// ---------- Tipos ----------

export interface GuiaTrabalhador {
  nome: string;
  cpf: string | null;
  matricula: string | null;
}

export interface GuiaInfo {
  recno: number;
  doc: string;
  identificador: string | null;   // nº da guia (ex.: 0126101467121855-0)
  cobv: string | null;            // hash cobv do PIX copia e cola
  totalGuia: number | null;
  vencimento: string | null;      // YYYY-MM-DD
  tag: string | null;             // tag da guia (nome do trabalhador quando 1)
  trabalhadores: GuiaTrabalhador[];
  composicao: string[];
  arquivoIds: number[];
  guiaArquivoId: number | null;   // arquivo_id do PDF da guia (evidência)
  guiaBuf?: Buffer;               // binário da guia (salvo como evidência)
}

interface ProcessoMin {
  recno: number;
  doc: string;
  chaveDocs: string;              // chave p/ /old/api/arquivo/lista
  valor: number;
  vencimento: string | null;      // DDSPVENC
  emissao: string | null;
}

export interface PortalResolucaoResumo {
  tentados: number;
  resolvidos: number;
  identificados_sem_cadastro: number;
  sem_processo: number;
  ambiguos_confirmados: number;
  erros: { envioId: number; erro: string }[];
}

// ---------- PDF → texto (mesmo loader do pipeline de comprovantes) ----------

async function pdfText(buffer: Buffer): Promise<string> {
  const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>;
  const pdfjs = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const items = (await page.getTextContent()).items as any[];
    // Reconstrói linhas visuais (mesmo critério de linhasVisuais do folha-pdf)
    const groups: { y: number; parts: { x: number; s: string }[] }[] = [];
    for (const it of items) {
      const y = it.transform?.[5];
      const x = it.transform?.[4];
      if (typeof y !== 'number' || typeof x !== 'number' || !it.str) continue;
      let g = groups.find((g) => Math.abs(g.y - y) < 3);
      if (!g) { g = { y, parts: [] }; groups.push(g); }
      g.parts.push({ x, s: it.str });
    }
    for (const g of groups.sort((a, b) => b.y - a.y)) {
      const line = g.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim();
      if (line) parts.push(line);
    }
  }
  return parts.join('\n');
}

function parseValorBR(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseDataBR(s: string | null | undefined): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// ---------- Parse da guia GFD (FGTSRESCISRIO.pdf) ----------

function parseGuiaFgts(text: string): Partial<GuiaInfo> {
  // cobv caixa = hash hex de 32 chars (o copia-e-cola continua grudado depois,
  // então [0-9a-z]+ comeria o resto do payload). Tesouro (apipix) não aparece
  // em guias FGTS.
  const cobv = /cobv\/([0-9a-f]{32})/i.exec(text)?.[1] || null;
  const identificador = /(\d{14,16}-\d)/.exec(text)?.[1] || null;
  const totalGuia = parseValorBR(/Total da Guia\s*:?\s*([\d.,]+)/i.exec(text)?.[1]);
  const vencimento =
    parseDataBR(/Pagar este documento at[ée]\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text)?.[1]) ||
    parseDataBR(/Vencimento da Guia\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text)?.[1]);
  // Linha "Núm. de Pág. | Identificador | Tag": a tag costuma ser o nome do
  // trabalhador quando a guia é individual.
  let tag: string | null = null;
  const tagM = /\d{14,16}-\d\s+([A-ZÀ-Ý][A-ZÀ-Ý0-9 ]{4,})\s/.exec(text);
  if (tagM) tag = tagM[1].trim();
  const composicao: string[] = [];
  for (const m of text.matchAll(/(\d{2}\/\d{4})\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/g)) {
    composicao.push(`comp ${m[1]}: FGTS mensal ${m[3]}, rescisório ${m[4]}, compensatória ${m[5]}, encargos ${m[6]} → ${m[7]}`);
  }
  return { cobv, identificador, totalGuia, vencimento, tag, composicao };
}

// ---------- Parse do relatório (RELATRIOFGTS.pdf) ----------

function parseRelatorioFgts(text: string): { trabalhadores: GuiaTrabalhador[]; identificador: string | null; totalGuia: number | null } {
  const trabalhadores = new Map<string, GuiaTrabalhador>();
  // Layout tabular: "10/2026  NOME  20726  066.481.959-16  101 ..."
  for (const m of text.matchAll(/\d{2}\/\d{4}\s+([A-ZÀ-Ý][A-ZÀ-Ý ]{4,}?)\s+(\d{3,})\s+(\d{3}\.\d{3}\.\d{3}-\d{2})/g)) {
    const cpf = m[3].replace(/\D/g, '');
    if (!trabalhadores.has(cpf)) {
      trabalhadores.set(cpf, { nome: m[1].trim(), cpf, matricula: m[2] });
    }
  }
  // Layout transposto (pdfjs em colunas): "Nome Trabalhador NOME NOME NOME",
  // "CPF xxx xxx", "Matrícula n n" — dedup dos valores repetidos por linha.
  if (!trabalhadores.size) {
    const nomes = [...text.matchAll(/Nome Trabalhador\s+([A-ZÀ-Ý][A-ZÀ-Ý ]+?)(?:\s+\1|$)/gm)].map((m) => m[1].trim());
    const cpfs = [...new Set([...text.matchAll(/\d{3}\.\d{3}\.\d{3}-\d{2}/g)].map((m) => m[0]))];
    const mats = [...new Set([...text.matchAll(/Matr[íi]cula\s+(\d+)/g)].map((m) => m[1]))];
    cpfs.forEach((cpf, i) => {
      const c = cpf.replace(/\D/g, '');
      if (!trabalhadores.has(c)) {
        trabalhadores.set(c, { nome: nomes[i] || nomes[0] || '', cpf: c, matricula: mats[i] || mats[0] || null });
      }
    });
  }
  const identificador = /N[úu]mero da Guia\s*:?\s*(\d{14,16}-\d)/i.exec(text)?.[1] || null;
  const totalGuia = parseValorBR(/Total da Guia \(FGTS\)\s*:?\s*([\d.,]+)/i.exec(text)?.[1]);
  return { trabalhadores: [...trabalhadores.values()], identificador, totalGuia };
}

// ---------- Portal: processos + guias ----------

function processoMin(p: Record<string, any>): ProcessoMin {
  const chave = String(p.CDSCHAVENF || '').replace(/\s/g, '');
  return {
    recno: Number(p.NDSRECNO) || 0,
    doc: String(p.CDSDOC || '').trim(),
    chaveDocs: `${chave}${String(p.NDSRECNO).trim()}`,
    valor: Number(p.NDSVALMERC) || 0,
    vencimento: String(p.DDSPVENC || '').slice(0, 10) || null,
    emissao: String(p.DDSEMISSA || '').slice(0, 10) || null,
  };
}

/** Lista processos de pagamento cuja GUIA vence na janela [deVenc, ateVenc].
 *  DDSEMISSA_DE/ATE filtra server-side (DDSPVENC_* não existe): a guia é
 *  emitida dias antes do vencimento, então a janela de emissão cobre
 *  [-20d, +2d]. A lista é densa (~200 procs/dia) e paginada por doc — fatia
 *  a emissão em semanas pra cada sub-query caber na paginação. */
async function listarProcessos(deVenc: string, ateVenc: string): Promise<ProcessoMin[]> {
  const pad = (d: string, dias: number) => {
    const t = new Date(`${d}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + dias);
    return t.toISOString().slice(0, 10);
  };
  const deEmi = pad(deVenc, -20);
  const ateEmi = pad(ateVenc, +2);
  const deMs = new Date(`${deVenc}T00:00:00Z`).getTime();
  const ateMs = new Date(`${ateVenc}T23:59:59Z`).getTime();

  const out: ProcessoMin[] = [];
  const seen = new Set<number>();
  for (let a = deEmi; a <= ateEmi; a = pad(a, 7)) {
    const b = pad(a, 6) < ateEmi ? pad(a, 6) : ateEmi;
    const items = await eqsListProcpag(
      { DDSEMISSA_DE: `${a}T00:00:00-03:00`, DDSEMISSA_ATE: `${b}T23:59:59-03:00` },
      TENANT,
      30
    );
    for (const it of items) {
      const p = processoMin(it);
      if (!p.recno || p.chaveDocs.length <= 8 || seen.has(p.recno)) continue;
      const v = p.vencimento ? new Date(`${p.vencimento}T12:00:00Z`).getTime() : 0;
      if (v < deMs || v > ateMs) continue;
      seen.add(p.recno);
      out.push(p);
    }
  }
  return out;
}

function pickGuiaDocs(docs: PortalDocItem[]): { guia: PortalDocItem | null; relatorio: PortalDocItem | null } {
  let guia: PortalDocItem | null = null;
  let relatorio: PortalDocItem | null = null;
  for (const d of docs) {
    const n = (d.nome || '').toUpperCase();
    if (/RELAT|DETALH/i.test(n)) relatorio = relatorio || d;
    else if (/FGTS|GRRF|GUIA|GRF|RESC/i.test(n) || d.tipo === 'G') guia = guia || d;
  }
  return { guia, relatorio };
}

/** Baixa e parseia guia + relatório de um processo. */
async function guiaDoProcesso(cookies: string, proc: ProcessoMin): Promise<GuiaInfo | null> {
  const [grupo, filial] = TENANT.split(',');
  const docs = await oldPortalListDocs(cookies, grupo, filial, proc.chaveDocs);
  if (!docs.length) return null;
  const { guia, relatorio } = pickGuiaDocs(docs);
  const info: GuiaInfo = {
    recno: proc.recno, doc: proc.doc, identificador: null, cobv: null,
    totalGuia: null, vencimento: null, tag: null, trabalhadores: [], composicao: [],
    arquivoIds: docs.map((d) => d.arquivo_id), guiaArquivoId: guia?.arquivo_id || null,
  };
  if (guia) {
    const buf = await oldPortalDownload(cookies, guia.arquivo_id);
    if (buf && buf.length <= GUIA_MAX_BYTES) {
      Object.assign(info, parseGuiaFgts(await pdfText(buf)));
      info.guiaBuf = buf; // guarda p/ evidência
    }
  }
  if (relatorio) {
    const buf = await oldPortalDownload(cookies, relatorio.arquivo_id);
    if (buf && buf.length <= GUIA_MAX_BYTES) {
      const rel = parseRelatorioFgts(await pdfText(buf));
      info.trabalhadores = rel.trabalhadores;
      info.identificador = info.identificador || rel.identificador;
      info.totalGuia = info.totalGuia ?? rel.totalGuia;
    }
  }
  if (!info.vencimento) info.vencimento = proc.vencimento;
  if (info.totalGuia == null) info.totalGuia = proc.valor;
  return info;
}

// ---------- Funcionários ----------

function normCpf(s: string | null | undefined): string {
  return (s || '').replace(/\D/g, '');
}

function normNome(s: string | null | undefined): string {
  return (s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findFunc(funcs: Funcionario[], cpf: string | null | undefined, nome: string | null | undefined): Funcionario | null {
  const c = normCpf(cpf);
  if (c.length === 11) {
    const hit = funcs.find((f) => normCpf(f.cpf) === c);
    if (hit) return hit;
  }
  const n = normNome(nome);
  if (n.length >= 6) {
    const hits = funcs.filter((f) => normNome(f.nome) === n);
    if (hits.length === 1) return hits[0];
  }
  return null;
}

// ---------- Resolução ----------

function outDir(runId: number): string {
  return join(process.env.COMPROVANTES_OUTPUT_DIR || join(process.cwd(), 'comprovantes-output'), String(runId));
}

/**
 * Tenta identificar envios 'sem_par_txt' e 'valor_ambiguo' do run consultando o
 * portal EQS (processos CBME** na janela de vencimento dos pagamentos).
 * Resolvidos viram 'pronto' com meta.portal preenchido; os demais ficam
 * anotados com o que o portal revelou.
 */
export async function resolverComprovantesPortal(runId: number): Promise<PortalResolucaoResumo> {
  const out: PortalResolucaoResumo = {
    tentados: 0, resolvidos: 0, identificados_sem_cadastro: 0,
    sem_processo: 0, ambiguos_confirmados: 0, erros: [],
  };
  if (!sql || !eqsPortalConfigured()) {
    out.erros.push({ envioId: 0, erro: 'portal EQS não configurado (PORTAL_EQS_USER/PASS)' });
    return out;
  }

  const envios = await sql`
    SELECT id, page_num, cpf, nome, status, meta
    FROM comprovantes_envios
    WHERE run_id = ${runId} AND tipo_pagamento = 'FGTS'
      AND status IN ('sem_par_txt', 'valor_ambiguo')`;
  if (!envios.length) return out;

  // Janela: min/max das datas de pagamento (fallback: vencimento)
  const datas = envios
    .map((e: any) => String(e.meta?.dataPagamento || e.meta?.vencimento || ''))
    .filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const hoje = new Date().toISOString().slice(0, 10);
  const de = datas.length ? datas.sort()[0] : hoje;
  const ate = datas.length ? datas.sort().slice(-1)[0] : hoje;
  const pad = (d: string, dias: number) => {
    const t = new Date(`${d}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + dias);
    return t.toISOString().slice(0, 10);
  };

  const cookies = await oldPortalSession();
  if (!cookies) {
    out.erros.push({ envioId: 0, erro: 'login no portal antigo falhou' });
    return out;
  }

  const procs = await listarProcessos(pad(de, -10), pad(ate, +10));
  const guiaCache = new Map<number, GuiaInfo | null>();
  const guiaInfo = async (p: ProcessoMin) => {
    if (!guiaCache.has(p.recno)) guiaCache.set(p.recno, await guiaDoProcesso(cookies, p).catch(() => null));
    return guiaCache.get(p.recno)!;
  };
  const funcs = await listAllFuncionarios();

  const candidatosPorValor = (valor: number | null): ProcessoMin[] => {
    if (valor == null) return [];
    const cents = Math.round(valor * 100);
    return procs.filter((p) => Math.abs(Math.round(p.valor * 100) - cents) <= VALOR_TOL_CENTS);
  };

  const salvarGuia = (envioId: number, buf: Buffer | undefined): string | null => {
    if (!buf) return null;
    mkdirSync(outDir(runId), { recursive: true });
    const p = join(outDir(runId), `guia_portal_${envioId}.pdf`);
    writeFileSync(p, buf);
    return p;
  };

  const portalMeta = (g: GuiaInfo, guiaPath: string | null) => ({
    processo: g.recno, doc: g.doc, guia: g.identificador, guiaVenc: g.vencimento,
    totalGuia: g.totalGuia, cobv: g.cobv, composicao: g.composicao,
    trabalhadores: g.trabalhadores, arquivoIds: g.arquivoIds,
    guiaPath: guiaPath || undefined, fonte: 'portal EQS', identificadoEm: new Date().toISOString(),
  });

  for (const env of envios as any[]) {
    out.tentados++;
    try {
      const meta = env.meta || {};
      const valor = typeof meta.valor === 'number' ? meta.valor : null;
      const cands = candidatosPorValor(valor);
      const urlQrCobv = /cobv\/([0-9a-zA-Z]+)/i.exec(String(meta?.txt?.urlQr || ''))?.[1] || null;

      // valor_ambiguo: a entrada .rem pareada traz urlQr cujo cobv identifica a
      // guia exata entre os candidatos de mesmo valor.
      let guia: GuiaInfo | null = null;
      if (env.status === 'valor_ambiguo' && urlQrCobv) {
        for (const p of cands) {
          const g = await guiaInfo(p);
          if (g?.cobv === urlQrCobv) { guia = g; break; }
        }
      } else {
        // sem_par_txt: o candidato único pelo valor vence; em empate o cobv não
        // ajuda (comprovante não traz cobv) — confirma pela guia mais próxima
        // do vencimento do comprovante.
        const venc = String(meta.vencimento || meta.dataPagamento || '');
        let melhor: { g: GuiaInfo; dist: number } | null = null;
        for (const p of cands) {
          const g = await guiaInfo(p);
          if (!g) continue;
          const gv = g.vencimento || p.vencimento || '';
          const dist = venc && gv ? Math.abs(new Date(gv).getTime() - new Date(venc).getTime()) : 0;
          if (!melhor || dist < melhor.dist) melhor = { g, dist };
        }
        guia = melhor?.g || null;
      }

      if (!guia) {
        out.sem_processo++;
        await sql`UPDATE comprovantes_envios
          SET meta = meta || ${JSON.stringify({ portal: { status: 'sem_processo', tentativaEm: new Date().toISOString() } })}::jsonb
          WHERE id = ${env.id}`;
        continue;
      }

      // Confere o total: guia × comprovante (tolerância de centavos)
      const valorOk = valor == null || guia.totalGuia == null
        || Math.abs(Math.round(guia.totalGuia * 100) - Math.round(valor * 100)) <= VALOR_TOL_CENTS;
      const guiaPath = salvarGuia(env.id, guia.guiaBuf);
      delete guia.guiaBuf;
      const pm = portalMeta(guia, guiaPath);
      if (!valorOk) {
        out.sem_processo++;
        await sql`UPDATE comprovantes_envios
          SET meta = meta || ${JSON.stringify({ portal: { ...pm, status: 'valor_divergente' } })}::jsonb
          WHERE id = ${env.id}`;
        continue;
      }

      // Trabalhador: 1 único na guia → direto; senão casa pelo CPF do envio
      // (valor_ambiguo já tem o funcionário resolvido pelo J52).
      let trabalhador: GuiaTrabalhador | null = null;
      if (guia.trabalhadores.length === 1) trabalhador = guia.trabalhadores[0];
      else if (guia.trabalhadores.length > 1 && env.cpf) {
        trabalhador = guia.trabalhadores.find((t) => normCpf(t.cpf) === normCpf(env.cpf)) || null;
      }
      if (!trabalhador && guia.tag) trabalhador = { nome: guia.tag, cpf: null, matricula: null };

      const func = findFunc(funcs, trabalhador?.cpf || env.cpf, trabalhador?.nome || env.nome);

      if (env.status === 'valor_ambiguo') {
        // Entrada .rem identificada pela guia; confirma se o trabalhador da
        // guia é o mesmo do envio (CPF bate) → pareamento confirmado.
        const confere = func && normCpf(func.cpf) === normCpf(trabalhador?.cpf || env.cpf);
        if (confere || (trabalhador && normCpf(env.cpf) === normCpf(trabalhador.cpf))) {
          out.ambiguos_confirmados++;
          out.resolvidos++;
          await sql`UPDATE comprovantes_envios
            SET status = 'pronto',
                meta = meta || ${JSON.stringify({ portal: { ...pm, status: 'confirmado' } })}::jsonb,
                error = ${`Pareamento confirmado via portal: ${trabalhador?.nome || func?.nome} — guia ${guia.identificador || guia.doc} (proc. ${guia.doc}/${guia.recno})`}
            WHERE id = ${env.id}`;
        } else {
          await sql`UPDATE comprovantes_envios
            SET meta = meta || ${JSON.stringify({ portal: { ...pm, status: 'trabalhador_divergente', trabalhador } })}::jsonb
            WHERE id = ${env.id}`;
        }
        continue;
      }

      // sem_par_txt
      if (func) {
        out.resolvidos++;
        await sql`UPDATE comprovantes_envios
          SET status = 'pronto', cpf = ${func.cpf}, nome = ${func.nome},
              regiao = ${func.regiao}, cc = ${func.cc},
              meta = meta || ${JSON.stringify({ via: 'portal_guia', portal: { ...pm, status: 'resolvido', trabalhador } })}::jsonb,
              error = ${`Paga fora da remessa — identificada via portal: ${trabalhador?.nome || func.nome} (guia ${guia.identificador || guia.doc}, proc. ${guia.doc}/${guia.recno})`}
          WHERE id = ${env.id}`;
      } else if (trabalhador) {
        out.identificados_sem_cadastro++;
        await sql`UPDATE comprovantes_envios
          SET nome = ${trabalhador.nome}, cpf = ${trabalhador.cpf || env.cpf},
              meta = meta || ${JSON.stringify({ portal: { ...pm, status: 'sem_cadastro', trabalhador } })}::jsonb,
              error = ${`Portal identificou ${trabalhador.nome} (CPF ${trabalhador.cpf || '—'}) mas não consta no cadastro de funcionários`}
          WHERE id = ${env.id}`;
      } else {
        await sql`UPDATE comprovantes_envios
          SET meta = meta || ${JSON.stringify({ portal: { ...pm, status: 'sem_trabalhador' } })}::jsonb
          WHERE id = ${env.id}`;
      }
    } catch (e: any) {
      out.erros.push({ envioId: env.id, erro: String(e?.message || e).slice(0, 200) });
    }
  }
  return out;
}
