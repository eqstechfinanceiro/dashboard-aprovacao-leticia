// Motor do plano de auto-carga — compartilhado por preflight (GET), execute
// (POST) e force (POST). A fonte de verdade dos valores é o snapshot congelado;
// a fonte de verdade do cartão é o card_map descoberto na VExpenses.

import { sql } from '@/lib/db/neon';
import { toNum, r2 } from '@/lib/quinzena/financials';
import { normalizeCpf } from '@/lib/auth/scope';
import { normalizeName } from '@/lib/quinzena/name-resolve';
import { ensureAutocargaSchema } from './tables';
import { refreshCardMap, loadCardMapRows, CardMapRow } from './card-map';
import { getPoolBalance, getGroupBalances, listCardGroups } from '@/lib/vexpay/client';

export class PlanError extends Error {
  constructor(
    public code: 'not_frozen' | 'no_db' | 'auth' | 'upstream',
    message: string,
  ) {
    super(message);
    this.name = 'PlanError';
  }
}

export interface LoadItem {
  cpf: string;
  colaborador: string;
  amount: number;
  balance_account_id: string;
  card_number: string;
  card_group_id: string;
  card_group_name: string;
  user_uuid: string;
  matched_by: 'cpf' | 'name';
}

export interface BlockedItem {
  cpf: string;
  colaborador: string;
  amount: number;
  reason:
    | 'valor_invalido'
    | 'sem_cartao'
    | 'funcionario_inativo'
    | 'cadastro_pendente'
    | 'cartao_inativo'
    | 'cpf_nao_encontrado'
    | 'nome_ambiguo';
  detail: string;
  forceable: boolean;
  card_group_id?: string;
  balance_account_id?: string;
  card_number?: string;
  card_group_name?: string;
}

export interface GroupPlan {
  card_group_id: string;
  name: string;
  needed: number;
  available: number;
  deposit: number;
  group_balance_id: string | null;
}

export interface CargaPlan {
  year: number;
  month: number;
  quinzena: number;
  pool: number;
  total_to_load: number;
  pool_sufficient: boolean;
  pool_deficit: number;
  groups: GroupPlan[];
  loads: LoadItem[];
  blocked: BlockedItem[];
  already_loaded: { cpf: string; colaborador: string; amount: number; transaction_id: string | null }[];
  card_map: { refreshed: boolean; stale: boolean; cards: number; resolved_by_cpf: number; resolved_by_name: number };
}

function isActiveCard(c: CardMapRow): boolean {
  const st = `${c.card_status ?? ''} ${c.account_status ?? ''}`;
  if (/inativ|bloquead|cancel|suspend|encerrad/i.test(st)) return false;
  return /activ|ativ/i.test(st) || c.card_status === '' || c.card_status === null;
}

function classifyRow(
  row: { cpf: string; colaborador: string; situacao: string; status_cartao: string; carga_final: number },
  byCpf: Map<string, CardMapRow[]>,
  byName: Map<string, CardMapRow[]>,
): { load?: LoadItem; blocked?: BlockedItem } {
  const base = { cpf: row.cpf, colaborador: row.colaborador, amount: row.carga_final };

  if (!isFinite(row.carga_final) || row.carga_final < 0) {
    return {
      blocked: {
        ...base, reason: 'valor_invalido',
        detail: `carga_final=${row.carga_final} — valor inválido`, forceable: false,
      },
    };
  }

  // 1) Match por CPF (autoritativo); 2) fallback por nome normalizado
  const cpfN = normalizeCpf(row.cpf);
  let cards: CardMapRow[] = cpfN ? (byCpf.get(cpfN) ?? []) : [];
  let matchedBy: 'cpf' | 'name' | null = cards.length ? 'cpf' : null;
  if (cards.length === 0) {
    const nameHits = byName.get(normalizeName(row.colaborador)) ?? [];
    if (nameHits.length > 1) {
      return {
        blocked: {
          ...base, reason: 'nome_ambiguo',
          detail: `${nameHits.length} cartões com o mesmo nome — resolva o vínculo manualmente`,
          forceable: false,
        },
      };
    }
    if (nameHits.length === 1) { cards = nameHits; matchedBy = 'name'; }
  }

  if (cards.length === 0) {
    return {
      blocked: {
        ...base, reason: 'sem_cartao',
        detail: row.status_cartao
          ? `status cartão: ${row.status_cartao} — nenhum cartão VExpenses encontrado`
          : 'nenhum cartão VExpenses encontrado — regularize o cadastro',
        forceable: false,
      },
    };
  }

  // Escolhe o cartão: preferir ACTIVE; ambiguidade real = >1 ACTIVE
  const active = cards.filter(isActiveCard);
  if (active.length > 1) {
    return {
      blocked: {
        ...base, reason: 'nome_ambiguo',
        detail: `${active.length} cartões ativos para o mesmo CPF — defina o destino manualmente`,
        forceable: false,
      },
    };
  }
  const card = active[0] ?? cards[0];

  const cardRef = {
    card_group_id: card.card_group_id,
    card_group_name: card.card_group_name ?? '',
    balance_account_id: card.balance_account_id,
    card_number: card.card_number ?? '',
  };

  if ((row.situacao ?? '').toUpperCase() !== 'ATIVO') {
    return {
      blocked: {
        ...base, ...cardRef, reason: 'funcionario_inativo',
        detail: `situação cadastral: ${row.situacao || 'desconhecida'} — confirme se deve receber`,
        forceable: true,
      },
    };
  }

  const st = (row.status_cartao ?? '').toLowerCase();
  if (/pendente|reprovad|n.o vinculad/i.test(st)) {
    return {
      blocked: {
        ...base, ...cardRef, reason: 'cadastro_pendente',
        detail: `status cartão: ${row.status_cartao}`,
        forceable: true,
      },
    };
  }

  if (!isActiveCard(card)) {
    return {
      blocked: {
        ...base, ...cardRef, reason: 'cartao_inativo',
        detail: `cartão …${card.card_number || '?'} com status ${card.card_status || card.account_status || 'desconhecido'} — a carga pode ser recusada`,
        forceable: true,
      },
    };
  }

  if (matchedBy === 'name') {
    return {
      blocked: {
        ...base, ...cardRef, reason: 'cpf_nao_encontrado',
        detail: `cartão …${card.card_number || '?'} (${card.vex_name}) encontrado por nome — CPF ${card.cpf ?? 'ausente'} ≠ planilha ${cpfN ?? '?'}`,
        forceable: true,
      },
    };
  }

  return {
    load: {
      ...base,
      balance_account_id: card.balance_account_id,
      card_number: card.card_number ?? '',
      card_group_id: card.card_group_id,
      card_group_name: card.card_group_name ?? '',
      user_uuid: card.user_uuid,
      matched_by: matchedBy ?? 'cpf',
    },
  };
}

export async function buildCargaPlan(year: number, month: number, quinzena: number): Promise<CargaPlan> {
  if (!sql) throw new PlanError('no_db', 'Banco de dados não configurado');
  await ensureAutocargaSchema();

  // Fonte dos valores: snapshot congelado (a única planilha auditável)
  const snaps = await sql`
    SELECT cpf, colaborador, situacao, status_cartao, carga_final::text
    FROM quinzena_frozen_snapshots
    WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
  `;
  if (snaps.length === 0) {
    throw new PlanError('not_frozen', 'Quinzena não está congelada — congele antes da auto-carga');
  }

  // Discovery do card_map — se a VExpenses falhar, cai pro cache com flag stale
  let freshUuids: Set<string> | null = null;
  let cardMapStale = false;
  try {
    const refresh = await refreshCardMap();
    freshUuids = refresh.fresh_uuids;
  } catch (e) {
    console.error('[autocarga] refreshCardMap falhou — usando cache:', e);
    cardMapStale = true;
  }

  const mapRows = await loadCardMapRows(freshUuids ?? undefined);
  const byCpf = new Map<string, CardMapRow[]>();
  const byName = new Map<string, CardMapRow[]>();
  for (const c of mapRows) {
    if (c.cpf) {
      const k = normalizeCpf(c.cpf)!;
      byCpf.set(k, [...(byCpf.get(k) ?? []), c]);
    }
    const n = normalizeName(c.vex_name);
    if (n) byName.set(n, [...(byName.get(n) ?? []), c]);
  }

  // CPFs já carregados neste período (idempotência cross-run)
  const loadedRows = await sql`
    SELECT DISTINCT ON (cpf) cpf, colaborador, amount::text, transaction_id
    FROM quinzena_carga_items
    WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      AND status IN ('ok', 'forced_ok')
    ORDER BY cpf, id DESC
  `;
  const loadedCpfs = new Set((loadedRows as any[]).map((r) => r.cpf));
  const alreadyLoaded = (loadedRows as any[]).map((r) => ({
    cpf: r.cpf, colaborador: r.colaborador, amount: toNum(r.amount), transaction_id: r.transaction_id,
  }));

  const loads: LoadItem[] = [];
  const blocked: BlockedItem[] = [];
  for (const s of snaps as any[]) {
    const amount = toNum(s.carga_final);
    if (amount <= 0 && !isNaN(amount)) continue; // sem carga — não é candidato
    if (loadedCpfs.has(s.cpf)) continue;          // já carregado — não repete
    const { load, blocked: b } = classifyRow(
      {
        cpf: s.cpf,
        colaborador: s.colaborador ?? '',
        situacao: s.situacao ?? '',
        status_cartao: s.status_cartao ?? '',
        carga_final: amount,
      },
      byCpf,
      byName,
    );
    if (load) loads.push(load);
    if (b) blocked.push(b);
  }

  // Agregação por grupo + saldos livres (balance/multiple) e ids de balance
  const groupsNeeded = new Map<string, number>();
  for (const l of loads) groupsNeeded.set(l.card_group_id, r2((groupsNeeded.get(l.card_group_id) ?? 0) + l.amount));
  const allGroupIds = [...groupsNeeded.keys()];

  let groupBalanceId = new Map<string, string>();
  try {
    for (const g of await listCardGroups()) groupBalanceId.set(g.id, g.balance_id);
  } catch (e) {
    console.error('[autocarga] listCardGroups falhou:', e);
  }

  let available = new Map<string, number>();
  try {
    available = await getGroupBalances(allGroupIds);
  } catch (e) {
    console.error('[autocarga] balance/multiple falhou:', e);
  }

  const groupName = new Map<string, string>();
  for (const l of loads) if (l.card_group_name) groupName.set(l.card_group_id, l.card_group_name);

  const groups: GroupPlan[] = allGroupIds.map((gid) => {
    const needed = groupsNeeded.get(gid) ?? 0;
    const avail = available.get(gid) ?? 0;
    return {
      card_group_id: gid,
      name: groupName.get(gid) ?? gid,
      needed,
      available: avail,
      deposit: r2(Math.max(0, needed - avail)),
      group_balance_id: groupBalanceId.get(gid) ?? null,
    };
  });

  const pool = await getPoolBalance();
  const total = r2(loads.reduce((s, l) => s + l.amount, 0));

  return {
    year, month, quinzena,
    pool,
    total_to_load: total,
    pool_sufficient: pool >= total,
    pool_deficit: r2(Math.max(0, total - pool)),
    groups,
    loads,
    blocked,
    already_loaded: alreadyLoaded,
    card_map: {
      refreshed: !cardMapStale,
      stale: cardMapStale,
      cards: mapRows.length,
      resolved_by_cpf: loads.filter((l) => l.matched_by === 'cpf').length,
      resolved_by_name: loads.filter((l) => l.matched_by === 'name').length,
    },
  };
}
