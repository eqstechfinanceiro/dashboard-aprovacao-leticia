// Pipeline de remessa de folha (FO/PR/BB/BRADESCO CNAB240 + PDFs de comprovantes).
//
// Duas fases:
//  1. 'analise'  — parseia TXTs + PDFs, casa cada comprovante com o cadastro de
//     funcionários (conta > CPF do TXT > CPF embutido > nome), cruza TXT×PDF
//     e grava um envio por item. Run fica 'aguardando_confirmacao': nada é
//     enviado sem revisão do usuário.
//  2. 'envio'    — para cada item 'pronto': fragmenta o PDF (CropBox na faixa
//     do comprovante), sobe ao SharePoint destino e envia ao e2doc (ambos
//     gateados), com dedup completo (SP + e2doc) igual ao pipeline principal.

import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { PDFDocument } from 'pdf-lib';
import { sql } from '../db/neon';
import { SP_SITES, listFiles, uploadFile } from './sharepoint';
import { loadPdfDoc, specPorTipo, buildDestinoPath, destinoFileName, retornarMes, competenciaFolha } from './pdf';
import { listAllFuncionarios, type Funcionario } from './funcionarios';
import { enviarComprovante, existeNoE2Doc } from './e2doc';
import { getSetting } from '../db/settings';
import { updateRunProgress, insertEnvio, finishRun, failRun, type RunRow } from './db';
import { parseCnab, BANCO_NOME, BANCO_E2DOC, type CnabEntry, type CnabFile } from './cnab';
import { analisarFolhaPdf, fragmentarComprovante, type ComprovanteFolha, type FolhaAnalise } from './folha-pdf';

const DESTINO = SP_SITES.destino;

export interface RemessaSelection {
  sig: string;
  dir: string;                       // pasta absoluta com os uploads
  files: { name: string; kind: 'pdf' | 'txt' }[];
  phase: 'analise' | 'envio';
  /** Competência e2doc 'MM/YYYY' escolhida pelo usuário; sem ela, deriva do
   *  pagamento (FOL → competência = mês anterior). */
  competencia?: string;
  /** Quando presente, a fase de envio processa só esses comprovantes_envios.id
   *  (envio de teste / seletivo). Vazio/ausente = todos os 'pronto'. */
  onlyEnvioIds?: number[];
}

// ---------- Índice de funcionários ----------

function normDigits(s: string | null | undefined): string {
  return (s || '').replace(/\D/g, '').replace(/^0+/, '');
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

interface FuncIndex {
  byCpf: Map<string, Funcionario>;
  byConta: Map<string, Funcionario[]>;   // agencia|conta → funcs
  byNome: Map<string, Funcionario[]>;    // nome normalizado → funcs
  nomesKeys: string[];
}

function addTo<T>(map: Map<string, T[]>, key: string, v: T) {
  const arr = map.get(key);
  if (arr) arr.push(v); else map.set(key, [v]);
}

function cpfValido(cpf: string | null | undefined): boolean {
  const d = (cpf || '').replace(/\D/g, '');
  return d.length === 11 && !/^(\d)\1{10}$/.test(d);
}

function buildFuncIndex(funcs: Funcionario[]): FuncIndex {
  const idx: FuncIndex = { byCpf: new Map(), byConta: new Map(), byNome: new Map(), nomesKeys: [] };
  for (const f of funcs) {
    // Registros sujos do cadastro (nome '.', CPF '00000000000', conta vazia)
    // não entram nos índices — a chave vazia casaria com qualquer consulta.
    if (cpfValido(f.cpf)) idx.byCpf.set(f.cpf!.replace(/\D/g, ''), f);
    const conta = normDigits(f.conta?.split('-')[0] ?? f.conta);
    if (f.agencia && conta) addTo(idx.byConta, `${normDigits(f.agencia)}|${conta}`, f);
    if (conta) addTo(idx.byConta, `|${conta}`, f); // fallback sem agência
    const nomeN = normNome(f.nome);
    if (nomeN.length >= 3) addTo(idx.byNome, nomeN, f);
  }
  idx.nomesKeys = [...idx.byNome.keys()].filter((k) => k.length >= 3);
  return idx;
}

/** Nome do comprovante pode estar truncado (CNAB corta em 30 chars) — match por
 *  prefixo em qualquer direção. Retorna candidatos únicos. */
function funcsPorNome(idx: FuncIndex, nome: string): Funcionario[] {
  const n = normNome(nome);
  if (n.length < 8) return [];
  const exact = idx.byNome.get(n);
  if (exact?.length) return exact;
  const out = new Map<string, Funcionario>();
  for (const key of idx.nomesKeys) {
    if (!key) continue;
    if (key.startsWith(n) || n.startsWith(key)) {
      for (const f of idx.byNome.get(key)!) out.set(f.cpf || key, f);
    }
  }
  return [...out.values()];
}

function funcsPorConta(idx: FuncIndex, agencia: string | null, conta: string | null): Funcionario[] {
  const c = normDigits(conta);
  if (!c) return [];
  const a = normDigits(agencia);
  if (a) {
    const exact = idx.byConta.get(`${a}|${c}`);
    if (exact?.length) return exact;
  }
  return idx.byConta.get(`|${c}`) || [];
}

// ---------- Reconciliação ----------

/** Par CNAB × comprovante: ref do pagador (Itaú), depois conta+valor, depois nome+valor. */
function matchCnab(comp: ComprovanteFolha, pool: CnabEntry[], usados: Set<CnabEntry>): CnabEntry | null {
  // 'seu número' CNAB (pos 74-93) — o pagadorRef do PDF casa com ele direto
  if (comp.pagadorRef) {
    const byRef = pool.find((e) => !usados.has(e) && e.seuNumero && e.seuNumero === comp.pagadorRef);
    if (byRef) return byRef;
  }
  const compConta = normDigits(comp.contaNumero);
  if (compConta && comp.valor != null) {
    const cents = Math.round(comp.valor * 100);
    const byConta = pool.filter((e) => !usados.has(e)
      && normDigits(e.conta) === compConta
      && Math.round(e.valor * 100) === cents);
    if (byConta.length === 1) return byConta[0];
  }
  if (comp.nome && comp.valor != null) {
    const cents = Math.round(comp.valor * 100);
    const n = normNome(comp.nome);
    const byNome = pool.filter((e) => !usados.has(e)
      && Math.round(e.valor * 100) === cents
      && (normNome(e.nome) === n || normNome(e.nome).startsWith(n) || n.startsWith(normNome(e.nome))));
    if (byNome.length === 1) return byNome[0];
  }
  return null;
}

interface AnaliseResumo {
  files: number; comprovantes: number; txtEntries: number;
  prontos: number; duplicadosPre: number; divergentes: number;
  semFuncionario: number; homonimos: number; semParTxt: number; txtSemPdf: number;
  formatoNaoReconhecido: number; warnings: string[];
}

export async function processRemessaRun(run: RunRow): Promise<void> {
  const sel = run.selection as unknown as RemessaSelection | null;
  if (!sel?.dir || !Array.isArray(sel.files)) {
    await failRun(run.id, 'run remessa sem selection.dir/files');
    return;
  }
  if (sel.phase === 'envio') return processRemessaEnvio(run, sel);
  return processRemessaAnalise(run, sel);
}

// ---------- FASE 1: análise ----------

async function processRemessaAnalise(run: RunRow, sel: RemessaSelection): Promise<void> {
  const resumo: AnaliseResumo = {
    files: 0, comprovantes: 0, txtEntries: 0,
    prontos: 0, duplicadosPre: 0, divergentes: 0,
    semFuncionario: 0, homonimos: 0, semParTxt: 0, txtSemPdf: 0,
    formatoNaoReconhecido: 0, warnings: [],
  };

  try {
    await updateRunProgress(run.id, { phase: 'analyzing', startedAt: run.started_at });

    // 1. TXTs CNAB
    const cnabs: CnabFile[] = [];
    for (const f of sel.files.filter((x) => x.kind === 'txt')) {
      const parsed = parseCnab(readFileSync(join(sel.dir, f.name)), f.name);
      resumo.warnings.push(...parsed.warnings.map((w) => `${f.name}: ${w}`));
      cnabs.push(parsed);
      resumo.txtEntries += parsed.entries.length;
    }
    const poolCnab = cnabs.flatMap((c) => c.entries.map((e) => ({ ...e, _file: c.fileName }))) as (CnabEntry & { _file: string })[];
    const usados = new Set<CnabEntry>();

    // 2. Funcionários (1 query — índice em memória)
    const funcIdx = buildFuncIndex(await listAllFuncionarios());

    // 3. PDFs → comprovantes
    const pdfs = sel.files.filter((x) => x.kind === 'pdf');
    resumo.files = sel.files.length;
    if (pdfs.length === 0) {
      await finishRun(run.id, { ...resumo, warning: 'Nenhum PDF enviado' });
      await sql`UPDATE comprovantes_runs SET status='aguardando_confirmacao' WHERE id=${run.id}`;
      return;
    }

    let totalPages = 0;
    let pagesDone = 0;
    for (const f of pdfs) {
      const buf = readFileSync(join(sel.dir, f.name));
      const analise: FolhaAnalise = await analisarFolhaPdf(buf, f.name, (done, total) => {
        void updateRunProgress(run.id, {
          phase: 'analyzing', currentFileName: f.name, filePages: total,
          filePagesDone: done, pagesProcessed: pagesDone + done, totalPages: totalPages + total,
        });
      });
      pagesDone += analise.totalPages;
      totalPages += analise.totalPages;
      resumo.comprovantes += analise.comprovantes.length;
      resumo.warnings.push(...analise.warnings);
      if (analise.formato === 'desconhecido') resumo.formatoNaoReconhecido++;

      // Índice BANCO do e2doc usa o rótulo do dicionário (BANCO_E2DOC), não o
      // nome de exibição do CNAB — 'BB (BANCO DO BRASIL)' é rejeitado, 'BB' passa.
      const BANCO_POR_FORMATO: Record<string, string> = { itau_folha: 'ITAU', bradesco_rt: 'BRADESCO', bb_pag: 'BB' };
      const bancoTxt = cnabs.find((c) => BANCO_NOME[c.banco] && f.name.toUpperCase().includes(BANCO_NOME[c.banco].split(' ')[0]));
      const bancoItem = (bancoTxt ? (BANCO_E2DOC[bancoTxt.banco] || bancoTxt.bancoNome) : null)
        || BANCO_POR_FORMATO[analise.formato] || null;

      for (const comp of analise.comprovantes) {
        const base = { runId: run.id, sourceFile: f.name, pageNum: comp.pageNum };
        const meta = { slot: comp.slot, crop: comp.crop, agencia: comp.agencia, conta: comp.conta, valor: comp.valor, pagadorRef: comp.pagadorRef, dataPagamento: comp.dataPagamento, warnings: [] as string[] };

        // TXT pair (quando há TXT)
        let txtPair: (CnabEntry & { _file: string }) | null = null;
        if (poolCnab.length) {
          txtPair = matchCnab(comp, poolCnab as any, usados) as any;
          if (txtPair) usados.add(txtPair);
        }

        // Resolve funcionário: CPF do comp → CPF do TXT → conta → nome
        let func: Funcionario | null = null;
        let via = '';
        if (comp.cpf && funcIdx.byCpf.get(comp.cpf)) { func = funcIdx.byCpf.get(comp.cpf)!; via = 'cpf_pdf'; }
        if (!func && txtPair?.cpf && funcIdx.byCpf.get(txtPair.cpf)) { func = funcIdx.byCpf.get(txtPair.cpf)!; via = 'cpf_txt'; }
        if (!func) {
          const porConta = funcsPorConta(funcIdx, comp.agencia, comp.contaNumero);
          if (porConta.length === 1) { func = porConta[0]; via = 'conta'; }
          else if (porConta.length > 1) meta.warnings.push(`${porConta.length} funcionários com a mesma conta`);
        }
        if (!func && comp.nome) {
          const porNome = funcsPorNome(funcIdx, comp.nome);
          if (porNome.length === 1) { func = porNome[0]; via = 'nome'; }
          else if (porNome.length > 1) {
            // homônimos — tenta desempatar pela conta
            const porConta = funcsPorConta(funcIdx, comp.agencia, comp.contaNumero);
            const hit = porNome.find((x) => porConta.includes(x));
            if (hit) { func = hit; via = 'nome+conta'; }
            else {
              resumo.homonimos++;
              await insertEnvio({
                ...base, nome: comp.nome, cpf: comp.cpf || txtPair?.cpf, tipoPagamento: 'FOL',
                status: 'homonimo_ambiguo', meta: { ...meta, candidatos: porNome.map((x) => ({ cpf: x.cpf, nome: x.nome, cc: x.cc })) },
                error: `${porNome.length} funcionários com nome compatível: ${porNome.map((x) => `${x.nome} (${x.cpf})`).join('; ').substring(0, 240)}`,
              });
              continue;
            }
          }
        }

        // Match apontou para registro de cadastro inválido (nome '.' / CPF
        // zerado) — o comprovante existe mas o funcionário não é utilizável:
        // tratar como não encontrado, nunca enviar com identidade inválida.
        if (func && (!cpfValido(func.cpf) || normNome(func.nome).length < 3)) {
          meta.warnings.push(`cadastro inválido no banco de funcionários: nome='${func.nome}' cpf='${func.cpf}'`);
          func = null;
        }

        const warnings: string[] = [...meta.warnings];
        if (poolCnab.length && !txtPair) { warnings.push('sem_par_txt'); resumo.semParTxt++; }
        if (txtPair && comp.valor != null && Math.round(txtPair.valor * 100) !== Math.round(comp.valor * 100)) {
          warnings.push(`valor_divergente: PDF R$${comp.valor} × TXT R$${txtPair.valor}`);
          resumo.divergentes++;
        }

        if (!func) {
          resumo.semFuncionario++;
          await insertEnvio({
            ...base, nome: comp.nome, cpf: comp.cpf || txtPair?.cpf, tipoPagamento: 'FOL',
            status: 'sem_funcionario', meta: { ...meta, warnings },
            error: `funcionário não encontrado (ag ${comp.agencia || '-'} cta ${comp.conta || '-'})`,
          });
          continue;
        }

        const divergente = warnings.some((w) => w.startsWith('valor_divergente'));
        resumo.prontos++;
        await insertEnvio({
          ...base,
          chave: null, cpf: func.cpf, nome: func.nome, regiao: func.regiao, cc: func.cc,
          tipoPagamento: 'FOL', banco: bancoItem,
          status: divergente ? 'divergencia' : 'pronto',
          meta: { ...meta, via, warnings, txt: txtPair ? { nome: txtPair.nome, valor: txtPair.valor, cpf: txtPair.cpf, file: txtPair._file } : null },
          error: warnings.filter((w) => w !== 'sem_par_txt').join('; ') || (warnings.includes('sem_par_txt') ? 'sem par no TXT' : null),
        });
      }
    }

    // 4. Entradas TXT sem par no PDF
    for (const e of poolCnab) {
      if (usados.has(e)) continue;
      resumo.txtSemPdf++;
      await insertEnvio({
        runId: run.id, sourceFile: e._file, pageNum: 0,
        nome: e.nome, cpf: e.cpf, tipoPagamento: 'FOL',
        status: 'txt_sem_pdf',
        meta: { agencia: e.agencia, conta: e.conta, valor: e.valor, dataPagamento: e.dataPagamento },
        error: 'presente no TXT mas nenhum comprovante correspondente no PDF',
      });
    }

    resumo.warnings = resumo.warnings.slice(0, 50);
    await sql`UPDATE comprovantes_runs SET result = ${JSON.stringify({ analise: resumo })}::jsonb, status = 'aguardando_confirmacao', finished_at = NOW() WHERE id = ${run.id}`;
  } catch (err) {
    await failRun(run.id, err instanceof Error ? err.message : String(err));
  }
}

// ---------- FASE 2: envio ----------

async function processRemessaEnvio(run: RunRow, sel: RemessaSelection): Promise<void> {
  const hoje = new Date();
  const dataFormatada = hoje.toISOString().slice(0, 10);
  const uploadEnabled = (await getSetting<boolean>('comprovantes_upload_enabled')) === true;

  const resumo = { enviados: 0, gerados: 0, duplicados: 0, erros: 0, skipped: 0 };
  const outDir = join(process.env.COMPROVANTES_OUTPUT_DIR || join(process.cwd(), 'comprovantes-output'), String(run.id));
  mkdirSync(outDir, { recursive: true });

  // Itens prontos gravados na análise (ou subconjunto envio seletivo/teste)
  const onlyIds = sel.onlyEnvioIds?.filter((n) => Number.isFinite(n)) || [];
  const itens = onlyIds.length
    ? await sql`
        SELECT * FROM comprovantes_envios
        WHERE run_id = ${run.id} AND id = ANY(${onlyIds})
          AND status IN ('pronto','divergencia')
        ORDER BY source_file, page_num, (meta->>'slot')::int NULLS FIRST
      `
    : await sql`
        SELECT * FROM comprovantes_envios
        WHERE run_id = ${run.id} AND status IN ('pronto','divergencia')
        ORDER BY source_file, page_num, (meta->>'slot')::int NULLS FIRST
      `;

  // Carrega cada PDF uma vez só
  const docCache = new Map<string, PDFDocument>();
  const destFiles = new Map<string, Set<string>>();
  const destinoFileExists = async (path: string, name: string) => {
    let s = destFiles.get(path);
    if (!s) { s = new Set((await listFiles(DESTINO, path)).map((f) => f.name)); destFiles.set(path, s); }
    return s.has(name);
  };

  // Pool de envio: e2doc (4 calls HTTP/doc) é o gargalo — I/O paralelo.
  // SharePoint fica serializado via mutex (página Playwright única) e com
  // espaçamento mínimo + retry com backoff em 429 (throttle do SP).
  const CONCURRENCY = 6;
  const SP_MIN_GAP_MS = 700;
  let spLock: Promise<void> = Promise.resolve();
  let spLast = 0;
  const spUploadOnce = async (path: string, name: string, buf: Buffer) => {
    const gap = Date.now() - spLast;
    if (gap < SP_MIN_GAP_MS) await new Promise((r) => setTimeout(r, SP_MIN_GAP_MS - gap));
    let lastErr: unknown;
    for (let tent = 0; tent < 4; tent++) {
      try {
        await uploadFile(DESTINO, path, name, buf);
        spLast = Date.now();
        return;
      } catch (err) {
        lastErr = err;
        const is429 = /429|throttl/i.test(String(err));
        if (!is429 || tent === 3) throw err;
        await new Promise((r) => setTimeout(r, 4000 * (tent + 1)));
      }
    }
    throw lastErr;
  };
  const spUpload = (path: string, name: string, buf: Buffer) => {
    const p = spLock.then(() => spUploadOnce(path, name, buf));
    spLock = p.then(() => undefined, () => undefined);
    return p;
  };

  let done = 0;
  const processItem = async (it: any) => {
    const meta = it.meta || {};

    try {
      const buf = readFileSync(join(sel.dir, it.source_file));
      let src = docCache.get(it.source_file);
      if (!src) { src = await loadPdfDoc(buf); docCache.set(it.source_file, src); }

      const comp: ComprovanteFolha = {
        pageNum: it.page_num, slot: meta.slot ?? 0, crop: meta.crop ?? null,
        nome: it.nome, agencia: meta.agencia, conta: meta.conta,
        contaNumero: meta.contaNumero ?? null, contaDv: null,
        valor: meta.valor ?? null, cpf: it.cpf, pagadorRef: meta.pagadorRef ?? null,
        dataPagamento: meta.dataPagamento ?? null,
      };

      // Fragmento
      const pdfBytes = await fragmentarComprovante(src, comp);
      const fileName = destinoFileName(it.nome || `pagina_${it.page_num}`, it.banco || null);
      const safeName = `${it.source_file.replace(/[^A-Za-z0-9_.-]/g, '_')}_p${it.page_num}s${comp.slot}_${fileName.replace(/[^A-Za-z0-9_.-]/g, '_')}`;
      const generatedPath = join(outDir, safeName);
      writeFileSync(generatedPath, pdfBytes);
      resumo.gerados++;

      // Competência/destino: data de pagamento do comprovante (fallback: mês
      // anterior ao run). O usuário pode forçar a competência e2doc no run.
      const dtPag = comp.dataPagamento || hoje.toISOString().slice(0, 10);
      const [anoVigente, mesNum] = [dtPag.slice(0, 4), dtPag.slice(5, 7)];
      const mesVigente = retornarMes(mesNum);
      const spec = specPorTipo('FOL', mesVigente)!;
      const destinoPath = buildDestinoPath(spec, anoVigente, mesVigente, dtPag.slice(8, 10), null);
      const competencia = /^\d{2}\/\d{4}$/.test(sel.competencia || '')
        ? sel.competencia!
        : competenciaFolha(mesNum, anoVigente);

      // Dedup completo (SP + e2doc)
      let duplicado = false;
      try { duplicado = await destinoFileExists(destinoPath, fileName); } catch {}
      let jaNoE2Doc = false;
      if (duplicado) {
        jaNoE2Doc = await existeNoE2Doc({
          cpf: it.cpf, competencia, modeloDocumento: spec.modeloDocumento!,
          modeloPasta: spec.modeloPasta, banco: it.banco || null,
        });
      }
      if (duplicado && jaNoE2Doc) {
        resumo.duplicados++;
        await sql`UPDATE comprovantes_envios SET status='duplicado', destino_path=${destinoPath}, destino_filename=${fileName}, generated_pdf_path=${generatedPath} WHERE id=${it.id}`;
        return;
      }

      if (uploadEnabled && !duplicado) {
        try {
          await spUpload(destinoPath, fileName, pdfBytes);
          destFiles.get(destinoPath)?.add(fileName);
        } catch (err) {
          resumo.erros++;
          await sql`UPDATE comprovantes_envios SET status='erro', error=${`upload SP falhou: ${String(err).substring(0, 300)}`} WHERE id=${it.id}`;
          return;
        }
      }

      const envio = await enviarComprovante({
        cpf: it.cpf, nome: it.nome, regiao: it.regiao || '', centroCusto: it.cc || '',
        banco: it.banco || null, competencia, dataFormatada,
        modeloDocumento: spec.modeloDocumento!, modeloPasta: spec.modeloPasta,
        label: spec.label, pdfBuffer: pdfBytes,
      });

      if (!envio.ok) {
        resumo.erros++;
        await sql`UPDATE comprovantes_envios SET status='e2doc_erro', error=${envio.error || 'falha E2DOC'}, generated_pdf_path=${generatedPath} WHERE id=${it.id}`;
        return;
      }
      resumo.enviados++;
      await sql`UPDATE comprovantes_envios SET
        status=${envio.dryRun ? (uploadEnabled ? 'enviado_sp_dryrun' : 'dryrun') : 'enviado_e2doc'},
        destino_path=${destinoPath}, destino_filename=${fileName},
        modelo_documento=${spec.modeloDocumento}, competencia=${competencia}, generated_pdf_path=${generatedPath}
        WHERE id=${it.id}`;
    } catch (err) {
      resumo.erros++;
      await sql`UPDATE comprovantes_envios SET status='erro', error=${String(err).substring(0, 300)} WHERE id=${it.id}`;
    }
    done++;
    if (done % 25 === 0 || done === itens.length) {
      await updateRunProgress(run.id, {
        phase: 'processing', currentFileName: it.source_file, pageNum: it.page_num,
        pagesProcessed: done, totalPages: itens.length,
      }).catch(() => {});
    }
  };

  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, itens.length) }, async () => {
    while (idx < itens.length) {
      const it = itens[idx++];
      await processItem(it);
    }
  }));

  await finishRun(run.id, resumo);
  try {
    const { enviarRelatorioRun } = await import('./email');
    await enviarRelatorioRun(run.id, resumo as any);
  } catch (err) {
    console.error(`[remessa] e-mail do run #${run.id} falhou:`, err);
  }
}
