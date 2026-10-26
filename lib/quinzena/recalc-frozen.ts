// Recálculo dos campos derivados (carga_parcial / reembolso / carga_final) de
// uma quinzena CONGELADA. O snapshot guarda as entradas da fórmula (col_qz,
// saldo_final, saldo_cartao_carga, saldo_reembolsar, adiantamento,
// status_cartao, reembolso_multiplier) e os overrides de resultado vivem em
// quinzena_manual_inputs — este módulo reaplica calcFinancials por cima dos
// valores congelados e persiste os três derivados.
//
// Usado por: POST /api/quinzena-complete (edição inline pós-freeze) e
// POST /api/quinzena/import-qz (importação em lote pós-freeze). A fórmula
// NÃO é duplicada aqui — mora em lib/quinzena/financials.ts.

import { sql } from '@/lib/db/neon';
import { toNum, r2, calcFinancials } from './financials';

export interface FrozenDerived {
  cpf: string;
  carga_parcial: number;
  reembolso: number;
  carga_final: number;
}

/**
 * Recalcula e persiste os derivados congelados para os CPFs informados.
 * Overrides em quinzena_manual_inputs vencem a fórmula (inclusive a regra de
 * "cadastro pendente = 0"), exatamente como no modo calculado.
 * Retorna um Map cpf → derivados persistidos (CPF ausente = não está no
 * snapshot).
 */
export async function recomputeFrozenDerived(
  cpfs: string[],
  year: number,
  month: number,
  quinzena: number,
): Promise<Map<string, FrozenDerived>> {
  const out = new Map<string, FrozenDerived>();
  if (!sql || cpfs.length === 0) return out;

  const snaps = await sql`
    SELECT cpf, status_cartao,
           saldo_final::text, saldo_cartao_carga::text, saldo_reembolsar::text,
           col_qz::text, adiantamento::text, reembolso_multiplier::text
    FROM quinzena_frozen_snapshots
    WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      AND cpf = ANY(${cpfs})
  `;
  if (snaps.length === 0) return out;

  const ovs = await sql`
    SELECT cpf, reembolso_override::text, carga_final_override::text
    FROM quinzena_manual_inputs
    WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      AND cpf = ANY(${cpfs})
  `;
  const ovByCpf = new Map<string, any>();
  for (const o of ovs as any[]) ovByCpf.set(o.cpf, o);

  const uCpfs: string[] = [];
  const uPar: number[] = [];
  const uRem: number[] = [];
  const uFin: number[] = [];

  for (const s of snaps as any[]) {
    const ov = ovByCpf.get(s.cpf);
    const reembolsoOverride =
      ov?.reembolso_override != null ? toNum(ov.reembolso_override) : null;
    const cargaFinalOverride =
      ov?.carga_final_override != null ? toNum(ov.carga_final_override) : null;

    const calc = calcFinancials(
      toNum(s.col_qz),
      Math.max(0, toNum(s.saldo_final)),
      toNum(s.saldo_cartao_carga),
      toNum(s.saldo_reembolsar),
      toNum(s.adiantamento),
      quinzena,
      s.status_cartao ?? '',
      s.reembolso_multiplier != null ? toNum(s.reembolso_multiplier) : 0.5,
    );

    const reembolso = reembolsoOverride ?? calc.reembolso;
    const carga_final =
      cargaFinalOverride ?? r2(Math.max(0, calc.carga_parcial) + reembolso);

    out.set(s.cpf, {
      cpf: s.cpf,
      carga_parcial: calc.carga_parcial,
      reembolso,
      carga_final,
    });
    uCpfs.push(s.cpf);
    uPar.push(calc.carga_parcial);
    uRem.push(reembolso);
    uFin.push(carga_final);
  }

  await sql.query(
    `UPDATE quinzena_frozen_snapshots s
       SET carga_parcial = v.parcial,
           reembolso     = v.reemb,
           carga_final   = v.final
     FROM (
       SELECT * FROM unnest($1::text[], $2::numeric[], $3::numeric[], $4::numeric[])
     ) AS v(cpf, parcial, reemb, final)
     WHERE s.cpf = v.cpf
       AND s.year = $5 AND s.month = $6 AND s.quinzena = $7`,
    [uCpfs, uPar, uRem, uFin, year, month, quinzena],
  );

  return out;
}
