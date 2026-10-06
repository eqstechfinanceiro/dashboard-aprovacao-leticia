// Port de docHudson.executar_automacao_sharepoint + executar_automacao.
// Diferenças proposionais em relação ao Python:
//  - Download direto do SharePoint via REST (sem temp local obrigatório)
//  - PDFs gerados são gravados em disco local (preview) E enviados ao SharePoint destino
//  - Upload ao SharePoint destino é gateado por app_settings.comprovantes_upload_enabled
//  - E2DOC é gateado por app_settings.e2doc_send_enabled (dry-run por padrão)
//  - Duplicidade no destino é verificada ANTES de enviar (status 'duplicado')

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { PDFDocument } from 'pdf-lib';
import { SP_SITES, listFiles, downloadFile, uploadFile, type SpSiteConfig } from './sharepoint';
import { analisarPdf, loadPdfDoc, splitPdfPage, specPorTipo, buildDestinoPath, destinoFileName, retornarMes, retornarBanco, competenciaFolha, sanitizeFileName, type PaginaInfo } from './pdf';
import { consultarPorCpf, consultarPorNomeSeguro, type Funcionario } from './funcionarios';
import { enviarComprovante, existeNoE2Doc } from './e2doc';
import { getSetting } from '../db/settings';
import { updateRunProgress, insertEnvio, finishRun, failRun, type RunRow } from './db';

const DESTINO = SP_SITES.destino;

function outputDir(runId: number): string {
  return join(process.env.COMPROVANTES_OUTPUT_DIR || join(process.cwd(), 'comprovantes-output'), String(runId));
}

interface WorkItem {
  source: string; year: string; month: string; bank: string; date: string;
  url: string; name: string;
}

// Caches que vivem pelo run inteiro — eliminam chamadas repetidas por página:
//  - funcionário por CPF/nome: 1 query por pessoa em vez de 1 por página
//  - listagem da pasta destino: 1 listFiles por pasta em vez de 1 fileExists por página
//    (cada fileExists era um roundtrip SharePoint via browser Playwright)
interface RunCaches {
  funcCpf: Map<string, Funcionario | null>;
  funcNome: Map<string, Funcionario | null>;
  destFiles: Map<string, Set<string>>;
  lastProgressAt: number;
}

interface EnvioCtx {
  runId: number; item: WorkItem; buffer: Buffer; outDir: string;
  srcDoc: PDFDocument;
  uploadEnabled: boolean; resumo: Resumo;
  mesNum: string; mesVigente: string; anoVigente: string; dataPagamento: string;
  competencia: string; banco: string | null; dataFormatada: string;
  caches: RunCaches;
}

async function funcPorCpf(caches: RunCaches, cpf: string): Promise<Funcionario | null> {
  if (!caches.funcCpf.has(cpf)) caches.funcCpf.set(cpf, await consultarPorCpf(cpf));
  return caches.funcCpf.get(cpf)!;
}

async function funcPorNome(caches: RunCaches, nome: string): Promise<Funcionario | null> {
  const key = nome.toUpperCase();
  if (!caches.funcNome.has(key)) caches.funcNome.set(key, await consultarPorNomeSeguro(nome));
  return caches.funcNome.get(key)!;
}

/** Dedup por pasta: lista o destino uma vez e confere o nome em memória. */
async function destinoFileExists(caches: RunCaches, destinoPath: string, fileName: string): Promise<boolean> {
  let names = caches.destFiles.get(destinoPath);
  if (!names) {
    names = new Set((await listFiles(DESTINO, destinoPath)).map((f) => f.name));
    caches.destFiles.set(destinoPath, names);
  }
  return names.has(fileName);
}

interface Resumo {
  files: number; pages: number; enviados: number; gerados: number; duplicados: number;
  semChave: number; cpfNaoEncontrado: number; nomeNaoEncontrado: number; tipoIncorreto: number;
  divergentes: number; ignorados: number; erros: number;
  e2docDryRun: boolean; uploadEnabled: boolean;
}

/**
 * Executa o envio de uma página já classificada: resolve destino, gera o PDF,
 * checa duplicidade, faz upload SP (gateado) e envio E2DOC (gateado).
 * `funcionario` é null apenas para cifra_adm (chave de documento, sem CPF).
 */
async function processarEnvio(
  ctx: EnvioCtx, pagina: PaginaInfo, funcionario: Funcionario | null,
  tipoEfetivo: string, nomeArquivoAdm: string | null
): Promise<void> {
  const { runId, item, buffer, outDir, uploadEnabled, resumo, mesNum, mesVigente, anoVigente, dataPagamento, competencia, banco, dataFormatada } = ctx;
  const base = { runId, sourceFile: item.name, pageNum: pagina.pageNum };
  // CPF efetivo: da chave digitada OU do funcionário resolvido por nome
  const cpfEfetivo = pagina.cpf || funcionario?.cpf || null;

  const spec = specPorTipo(tipoEfetivo, mesVigente);
  if (!spec) {
    resumo.tipoIncorreto++;
    await insertEnvio({
      ...base, chave: pagina.chave, cpf: cpfEfetivo, nome: funcionario?.nome || pagina.nomeBeneficiario,
      regiao: funcionario?.regiao, cc: funcionario?.cc, tipoPagamento: tipoEfetivo,
      status: 'tipo_incorreto',
    });
    return;
  }

  const destinoPath = buildDestinoPath(spec, anoVigente, mesVigente, dataPagamento, pagina.pedido);
  const fileName = nomeArquivoAdm ?? destinoFileName(funcionario!.nome, banco);
  const competenciaEnvio = tipoEfetivo === 'FOL' ? competenciaFolha(mesNum, anoVigente) : competencia;

  // Duplicidade: já existe no destino? (listagem da pasta cacheada por run)
  let duplicado = false;
  try {
    duplicado = await destinoFileExists(ctx.caches, destinoPath, fileName);
  } catch { /* se a verificação falhar, segue e registra */ }

  // Split da página (documento já carregado — sem reload por página)
  let generatedPath: string | null = null;
  let pdfBytes: Buffer | null = null;
  try {
    pdfBytes = await splitPdfPage(ctx.srcDoc, pagina.pageNum - 1);
    const safeName = `${item.name.replace(/[^A-Za-z0-9_.-]/g, '_')}_p${pagina.pageNum}_${fileName.replace(/[^A-Za-z0-9_.-]/g, '_')}`;
    generatedPath = join(outDir, safeName);
    writeFileSync(generatedPath, pdfBytes);
    resumo.gerados++;
  } catch (err) {
    resumo.erros++;
    await insertEnvio({
      ...base, chave: pagina.chave, cpf: cpfEfetivo, nome: funcionario?.nome || pagina.nomeBeneficiario,
      regiao: funcionario?.regiao, cc: funcionario?.cc, tipoPagamento: tipoEfetivo,
      pedido: pagina.pedido, destinoPath, destinoFilename: fileName,
      status: 'erro', error: `split falhou: ${String(err).substring(0, 300)}`,
    });
    return;
  }

  const envioBase = {
    ...base, chave: pagina.chave, cpf: cpfEfetivo, nome: funcionario?.nome || pagina.nomeBeneficiario,
    regiao: funcionario?.regiao, cc: funcionario?.cc, tipoPagamento: tipoEfetivo,
    pedido: pagina.pedido, modeloDocumento: spec.modeloDocumento, competencia: competenciaEnvio,
    destinoPath, destinoFilename: fileName, generatedPdfPath: generatedPath,
  };

  // Dedup é por entrega completa: arquivo no SharePoint E doc no e2doc.
  // Se o SP já tem o arquivo mas o e2doc ficou de fora (ex.: run anterior
  // falhou no passo e2doc), segue para o envio e2doc sem re-upload de SP.
  const elegivelE2Doc = !!(spec.enviaE2Doc && spec.modeloDocumento && funcionario && cpfEfetivo);
  let jaNoE2Doc = !elegivelE2Doc;
  if (duplicado && elegivelE2Doc) {
    jaNoE2Doc = await existeNoE2Doc({
      cpf: cpfEfetivo, competencia: competenciaEnvio,
      modeloDocumento: spec.modeloDocumento!, modeloPasta: spec.modeloPasta,
      banco, pedido: pagina.pedido,
    });
  }
  if (duplicado && jaNoE2Doc) {
    resumo.duplicados++;
    await insertEnvio({ ...envioBase, status: 'duplicado' });
    return;
  }

  // Upload SharePoint destino (gateado)
  if (uploadEnabled && !duplicado) {
    try {
      await uploadFile(DESTINO, destinoPath, fileName, pdfBytes!);
      ctx.caches.destFiles.get(destinoPath)?.add(fileName);
    } catch (err) {
      resumo.erros++;
      await insertEnvio({ ...envioBase, status: 'erro', error: `upload SP falhou: ${String(err).substring(0, 300)}` });
      return;
    }
  }

  // E2DOC (gateado internamente; ADM não envia; sem funcionário/CPF não há como enviar)
  if (!spec.enviaE2Doc || !spec.modeloDocumento || !funcionario || !cpfEfetivo) {
    await insertEnvio({ ...envioBase, status: uploadEnabled ? 'enviado_sp' : 'gerado' });
    resumo.enviados++;
    return;
  }

  const envio = await enviarComprovante({
    cpf: cpfEfetivo, nome: funcionario.nome, regiao: funcionario.regiao,
    centroCusto: funcionario.cc, banco, competencia: competenciaEnvio,
    dataFormatada, modeloDocumento: spec.modeloDocumento,
    modeloPasta: spec.modeloPasta, label: spec.label, pedido: pagina.pedido,
    pdfBuffer: pdfBytes!,
  });

  if (!envio.ok) {
    resumo.erros++;
    await insertEnvio({ ...envioBase, status: 'e2doc_erro', error: envio.error || 'falha E2DOC' });
    return;
  }

  resumo.enviados++;
  await insertEnvio({
    ...envioBase,
    status: envio.dryRun ? (uploadEnabled ? 'enviado_sp_dryrun' : 'dryrun') : 'enviado_e2doc',
  });
}

export async function processRun(run: RunRow): Promise<void> {
  const hoje = new Date();
  const dataFormatada = hoje.toISOString().slice(0, 10);
  const uploadEnabled = (await getSetting<boolean>('comprovantes_upload_enabled')) === true;

  // Caches e contadores de progresso do run inteiro
  const caches: RunCaches = {
    funcCpf: new Map(), funcNome: new Map(), destFiles: new Map(), lastProgressAt: 0,
  };
  let pagesProcessed = 0;
  let totalPages = 0;      // páginas conhecidas (soma dos arquivos já analisados)
  let filesAnalyzed = 0;

  /**
   * Progresso throttled — antes era 1 UPDATE no banco por página processada.
   * `force` furta o throttle em mudanças de fase/arquivo.
   */
  const reportProgress = async (extra: Record<string, unknown>, force = false) => {
    const now = Date.now();
    if (!force && now - caches.lastProgressAt < 400) return;
    caches.lastProgressAt = now;
    await updateRunProgress(run.id, {
      totalFiles: resumo.files,
      filesAnalyzed,
      pagesProcessed,
      totalPages,
      startedAt: run.started_at,
      ...extra,
    });
  };

  const resumo: Resumo = {
    files: 0, pages: 0, enviados: 0, gerados: 0, duplicados: 0,
    semChave: 0, cpfNaoEncontrado: 0, nomeNaoEncontrado: 0, tipoIncorreto: 0,
    divergentes: 0, ignorados: 0, erros: 0,
    e2docDryRun: true, uploadEnabled,
  };

  try {
    // Monta a lista de trabalho: seleção explícita de arquivos OU pasta inteira
    let workItems: WorkItem[];
    const selItems = run.selection?.items;
    if (selItems && selItems.length > 0) {
      workItems = selItems;
    } else {
      const site: SpSiteConfig = SP_SITES[run.source] || SP_SITES.eqs;
      const sourcePath = `${site.sourceBase}/${run.year}/${run.month_folder}/${run.bank}/${run.date_folder}`;
      const allFiles = await listFiles(site, sourcePath);
      workItems = allFiles
        .filter((f) => f.name.toUpperCase().endsWith('.PDF'))
        .map((f) => ({
          source: run.source, year: run.year!, month: run.month_folder!,
          bank: run.bank!, date: run.date_folder!, url: f.url, name: f.name,
        }));
    }
    resumo.files = workItems.length;

    if (workItems.length === 0) {
      await finishRun(run.id, { ...resumo, warning: 'Nenhum PDF na seleção/pasta' });
      return;
    }

    const outDir = outputDir(run.id);
    mkdirSync(outDir, { recursive: true });

    let fileIdx = 0;
    for (const item of workItems) {
      fileIdx++;
      // Contexto do item (define destino/competência — vem da pasta de origem)
      const mesNum = item.month.substring(0, 2);
      const mesVigente = retornarMes(mesNum);
      const anoVigente = item.year;
      const dataPagamento = item.date.split('-')[0];
      const competencia = `${mesNum}/${anoVigente}`;
      const banco = retornarBanco(item.bank);

      await reportProgress({
        phase: 'downloading', currentFile: fileIdx, currentFileName: item.name,
      }, true);

      let buffer: Buffer;
      try {
        buffer = await downloadFile(item.url, SP_SITES[item.source] || SP_SITES.eqs);
      } catch (err) {
        resumo.erros++;
        await insertEnvio({
          runId: run.id, sourceFile: item.name, pageNum: 0,
          status: 'erro', error: `download falhou: ${String(err).substring(0, 300)}`,
        });
        continue;
      }

      let analise;
      let srcDoc: PDFDocument;
      try {
        // pdfjs (texto) e pdf-lib (split) em paralelo — cada um parseia o arquivo 1 vez só
        [analise, srcDoc] = await Promise.all([
          analisarPdf(buffer, item.name, (done, total) => {
            void reportProgress({
              phase: 'analyzing', currentFile: fileIdx, currentFileName: item.name,
              filePages: total, filePagesDone: done,
            });
          }),
          loadPdfDoc(buffer),
        ]);
        filesAnalyzed++;
        totalPages += analise.totalPages;
      } catch (err) {
        resumo.erros++;
        await insertEnvio({
          runId: run.id, sourceFile: item.name, pageNum: 0,
          status: 'erro', error: `leitura PDF falhou: ${String(err).substring(0, 300)}`,
        });
        continue;
      }

      // Contexto compartilhado p/ o envio de cada página
      const ctx: EnvioCtx = {
        runId: run.id, item, buffer, outDir, srcDoc, uploadEnabled, resumo,
        mesNum, mesVigente, anoVigente, dataPagamento, competencia, banco, dataFormatada,
        caches,
      };

      for (const pagina of analise.paginas) {
        resumo.pages++;
        pagesProcessed++;
        await reportProgress({
          phase: 'processing', currentFile: fileIdx, currentFileName: item.name,
          filePages: analise.totalPages, pageNum: pagina.pageNum,
        });

        const base = { runId: run.id, sourceFile: item.name, pageNum: pagina.pageNum };

        // --- Categorias que apenas registram o motivo do skip ---
        if (pagina.categoria === 'sispag_forn' || pagina.categoria === 'interna' || pagina.categoria === 'vendor') {
          resumo.ignorados++;
          const status = pagina.categoria === 'sispag_forn' ? 'fornecedor_sispag'
            : pagina.categoria === 'interna' ? 'transferencia_interna' : 'arquivo_fornecedor';
          await insertEnvio({ ...base, nome: pagina.nomeBeneficiario, status });
          continue;
        }

        if (pagina.categoria === 'sem_chave') {
          resumo.semChave++;
          // registra nome + CPF do recebedor quando o comprovante os contém (auditoria)
          await insertEnvio({ ...base, nome: pagina.nomeBeneficiario, cpf: pagina.cpf, status: 'sem_chave' });
          continue;
        }

        if (pagina.categoria === 'cifra_outro') {
          resumo.tipoIncorreto++;
          await insertEnvio({
            ...base, chave: pagina.chave, nome: pagina.nomeBeneficiario,
            tipoPagamento: pagina.tipoPagamento, status: 'tipo_incorreto',
            error: 'sufixo CIFRA desconhecido',
          });
          continue;
        }

        // Chave digitada conflita com o documento do recebedor → segura p/ revisão
        if (pagina.divergencia) {
          resumo.divergentes++;
          await insertEnvio({
            ...base, chave: pagina.chave, cpf: pagina.cpf, nome: pagina.nomeBeneficiario,
            tipoPagamento: pagina.tipoPagamento, status: 'divergencia', error: pagina.divergencia,
          });
          continue;
        }

        // --- CIFRA<doc><sufixo oficial>: doc de empresa, sem funcionário, nome vem do beneficiário ---
        if (pagina.categoria === 'cifra_adm') {
          const nomeArq = sanitizeFileName(pagina.nomeBeneficiario || pagina.chave || `pagina_${pagina.pageNum}`);
          await processarEnvio(ctx, pagina, null, pagina.tipoPagamento || 'ADM', nomeArq);
          continue;
        }

        // --- Categorias que resolvem funcionário (chave, cifra_cpf, sispag_sal, name_lookup) ---
        const nomesAlvo = pagina.categoria === 'sispag_sal'
          ? pagina.nomesCreditados
          : [pagina.nomeBeneficiario];

        for (const nomeAlvo of nomesAlvo) {
          let funcionario: Funcionario | null = null;
          if (pagina.cpf) funcionario = await funcPorCpf(caches, pagina.cpf);
          if (!funcionario && nomeAlvo &&
              (pagina.categoria === 'sispag_sal' || pagina.categoria === 'name_lookup')) {
            funcionario = await funcPorNome(caches, nomeAlvo);
          }
          if (!funcionario) {
            if (pagina.cpf) resumo.cpfNaoEncontrado++; else resumo.nomeNaoEncontrado++;
            await insertEnvio({
              ...base, chave: pagina.chave, cpf: pagina.cpf,
              nome: nomeAlvo || pagina.nomeBeneficiario, tipoPagamento: pagina.tipoPagamento,
              status: pagina.cpf ? 'cpf_nao_encontrado' : 'nome_nao_encontrado',
            });
            continue;
          }
          await processarEnvio(ctx, pagina, funcionario, pagina.tipoPagamento || 'FOL', null);
        }
      }
    }

    resumo.e2docDryRun = !(await import('./e2doc').then((m) => m.isE2DocSendEnabled()));
    await finishRun(run.id, resumo);
    try {
      const { enviarRelatorioRun } = await import('./email');
      await enviarRelatorioRun(run.id, resumo);
    } catch (err) {
      console.error(`[comprovantes] e-mail do run #${run.id} falhou:`, err);
    }
  } catch (err) {
    await failRun(run.id, err instanceof Error ? err.message : String(err));
  }
}
