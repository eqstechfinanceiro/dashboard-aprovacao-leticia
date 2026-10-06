// Relatório por e-mail pós-run — port de utils.enviar_email (04-e2doc-2).
// GATE: só envia se app_settings.comprovantes_email_enabled === true
// E se SMTP_HOST/SMTP_USER/SMTP_PASS estiverem configurados no env.
// Falha de e-mail NUNCA falha o run — só registra no log.

import nodemailer from 'nodemailer';
import { sql } from '../db/neon';
import { getSetting } from '../db/settings';

interface ResumoRun {
  files: number; pages: number; enviados: number; gerados: number; duplicados: number;
  semChave: number; cpfNaoEncontrado: number; nomeNaoEncontrado: number; tipoIncorreto: number;
  divergentes: number; ignorados: number; erros: number;
  e2docDryRun: boolean; uploadEnabled: boolean;
}

export async function isEmailEnabled(): Promise<boolean> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return false;
  const v = await getSetting<boolean>('comprovantes_email_enabled');
  return v === true;
}

function secao(titulo: string, linhas: string[]): string {
  if (linhas.length === 0) return '';
  return `\n${titulo}\n${linhas.map((l) => ` - ${l}`).join('\n')}\n`;
}

export async function enviarRelatorioRun(runId: number, resumo: ResumoRun): Promise<void> {
  if (!(await isEmailEnabled())) return;

  const envios = await sql`
    SELECT status, nome, cpf, chave, modelo_documento, competencia, tipo_pagamento,
           source_file, page_num, error, destino_filename
    FROM comprovantes_envios WHERE run_id = ${runId} ORDER BY id
  `;

  const enviados = envios.filter((e: any) => ['enviado_e2doc', 'enviado_sp', 'enviado_sp_dryrun', 'dryrun', 'gerado'].includes(e.status));
  const cpfNaoEncontrado = envios.filter((e: any) => e.status === 'cpf_nao_encontrado');
  const nomeNaoEncontrado = envios.filter((e: any) => e.status === 'nome_nao_encontrado');
  const tipoIncorreto = envios.filter((e: any) => e.status === 'tipo_incorreto');
  const divergencias = envios.filter((e: any) => e.status === 'divergencia');
  const erros = envios.filter((e: any) => ['erro', 'e2doc_erro'].includes(e.status));
  const duplicados = envios.filter((e: any) => e.status === 'duplicado');
  const semChave = envios.filter((e: any) => e.status === 'sem_chave');

  const modo = resumo.e2docDryRun ? ' (DRY-RUN — nada enviado ao E2DOC)' : '';

  const listaEnviados = enviados
    .map((e: any) => `${e.nome || '?'}  -  ${e.modelo_documento || '-'}  -  ${e.competencia || '-'}`)
    .join('\n');

  const corpo = `Olá!

Segue o relatório do processamento de comprovantes (run #${runId})${modo}:

Arquivos processados: ${resumo.files}
Páginas analisadas: ${resumo.pages}
Comprovantes gerados: ${resumo.enviados}
Duplicados (já existiam no destino): ${resumo.duplicados}
Ignorados (fornecedor/transferência interna): ${resumo.ignorados}
${resumo.e2docDryRun ? '\n>>> ATENÇÃO: E2DOC está em modo DRY-RUN. Os comprovantes foram gerados e conferidos, mas NÃO foram enviados ao E2DOC. <<<\n' : ''}
Comprovantes processados:

NOME  -  MODELO DE DOCUMENTO  -  COMPETÊNCIA

${listaEnviados || '(nenhum)'}
${secao('Chaves com tipo de pagamento inconsistente:', tipoIncorreto.map((e: any) => `${e.chave || '?'} (arquivo ${e.source_file}, pág. ${e.page_num})`))}
${secao('CPFs não encontrados no banco de funcionários:', cpfNaoEncontrado.map((e: any) => `${e.cpf || '?'} — ${e.nome || 'sem nome'} (${e.source_file} pág. ${e.page_num})`))}
${secao('Funcionários não encontrados por nome:', nomeNaoEncontrado.map((e: any) => `${e.nome || '?'} (${e.source_file} pág. ${e.page_num})`))}
${secao('Divergências chave × recebedor (segurados p/ revisão):', divergencias.map((e: any) => `${e.nome || e.chave || '?'} — ${e.error || ''} (${e.source_file} pág. ${e.page_num})`))}
${secao('Páginas sem chave de identificação:', semChave.map((e: any) => `${e.source_file} pág. ${e.page_num}${e.nome ? ` — ${e.nome}` : ''}`))}
${secao('Comprovantes com erro:', erros.map((e: any) => `${e.source_file} pág. ${e.page_num} — ${e.error || 'erro'}`))}
${secao('Duplicados no destino (não reenviados):', duplicados.map((e: any) => `${e.destino_filename || e.nome || '?'} (${e.source_file} pág. ${e.page_num})`))}

Detalhes completos no portal: Automação Comprovantes → run #${runId}.

Atenciosamente,
Automação Aery`;

  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const destinatarios = (process.env.COMPROVANTES_EMAIL_TO || 'Financeiro@eqsengenharia.com.br')
    .split(',').map((s) => s.trim()).filter(Boolean);

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: destinatarios.join(', '),
    subject: `Comprovantes processados — run #${runId}${modo}`,
    text: corpo,
  });
}
