// Discovery do índice cartão→CPF usado pela auto-carga.
// /v2/app/accounts sem card_group_id só retorna ~8 contas do gestor — a
// descoberta é OBRIGATORIAMENTE por grupo (listCardGroups → listGroupAccounts).
// A ponte autoritativa user_uuid→cpf é GET /v3/pay/users/{uuid}, cacheada em
// quinzena_card_map (cpf é estável — fetch só pra uuid ainda desconhecido).

import { sql } from '@/lib/db/neon';
import {
  listCardGroups, listGroupAccounts, getPayUser, CardGroup,
} from '@/lib/vexpay/client';

const USER_FETCH_CONCURRENCY = 4;
// A VExpenses derruba o token (HTTP 403 por ~30-60s) quando leituras saem em
// burst — espaça os lotes pra ficar abaixo do limiar.
const BATCH_DELAY_MS = 300;
const GROUP_DELAY_MS = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Salvaguarda: só remove linhas "não vistas" se o discovery trouxe uma
// quantidade plausível de cartões (protege contra API paginando vazio).
const MIN_SEEN_FOR_PRUNE = 50;

export interface CardMapRow {
  user_uuid: string;
  cpf: string | null;
  vex_name: string | null;
  balance_account_id: string;
  account_id: string | null;
  card_number: string | null;
  card_group_id: string;
  card_group_name: string | null;
  card_status: string | null;
  account_status: string | null;
}

export interface CardMapRefreshResult {
  groups: number;
  cards_seen: number;
  cpf_fetched: number;
  pruned: number;
  fresh_uuids: Set<string>; // cartões vistos nesta rodada (vivos na VExpenses)
}

async function fetchUserCpfs(uuids: string[]): Promise<Map<string, { cpf: string | null; name: string }>> {
  const out = new Map<string, { cpf: string | null; name: string }>();
  for (let i = 0; i < uuids.length; i += USER_FETCH_CONCURRENCY) {
    if (i > 0) await sleep(BATCH_DELAY_MS);
    const batch = uuids.slice(i, i + USER_FETCH_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((u) => getPayUser(u)));
    results.forEach((r, j) => {
      if (r.status === 'fulfilled' && r.value) {
        out.set(batch[j], { cpf: r.value.cpf, name: r.value.name });
      } else {
        out.set(batch[j], { cpf: null, name: '' });
      }
    });
  }
  return out;
}

// Descobre todos os cartões da empresa, faz upsert em quinzena_card_map e
// resolve cpf pros uuids ainda sem. Retorna os uuids vivos (vistos agora).
export async function refreshCardMap(): Promise<CardMapRefreshResult> {
  if (!sql) throw new Error('Banco indisponível');

  const groups: CardGroup[] = await listCardGroups();
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const seen = new Set<string>();
  let upserted = 0;

  for (const g of groups) {
    if (seen.size > 0) await sleep(GROUP_DELAY_MS);
    const cards = await listGroupAccounts(g.id);
    for (const c of cards) {
      if (!c.user_uuid || !c.balance_account_id) continue;
      seen.add(c.user_uuid);
      await sql`
        INSERT INTO quinzena_card_map
          (user_uuid, vex_name, balance_account_id, account_id, card_number,
           card_group_id, card_group_name, card_status, account_status, updated_at)
        VALUES
          (${c.user_uuid}, ${c.user_name}, ${c.balance_account_id}, ${c.account_id},
           ${c.card_number}, ${c.card_group_id}, ${groupName.get(c.card_group_id) ?? null},
           ${c.card_status}, ${c.account_status}, NOW())
        ON CONFLICT (user_uuid) DO UPDATE SET
          vex_name = EXCLUDED.vex_name,
          balance_account_id = EXCLUDED.balance_account_id,
          account_id = EXCLUDED.account_id,
          card_number = EXCLUDED.card_number,
          card_group_id = EXCLUDED.card_group_id,
          card_group_name = EXCLUDED.card_group_name,
          card_status = EXCLUDED.card_status,
          account_status = EXCLUDED.account_status,
          updated_at = NOW()
      `;
      upserted++;
    }
  }

  // Remove cartões que sumiram da VExpenses (ex.: cartão cancelado/substituído)
  let pruned = 0;
  if (seen.size >= MIN_SEEN_FOR_PRUNE) {
    const del = await sql`
      DELETE FROM quinzena_card_map
      WHERE NOT (user_uuid = ANY(${[...seen]}::text[]))
      RETURNING user_uuid
    `;
    pruned = del.length;
  }

  // Resolve cpf apenas pros uuids vivos sem cpf cacheado
  const missing = await sql`
    SELECT user_uuid FROM quinzena_card_map
    WHERE cpf IS NULL AND user_uuid = ANY(${[...seen]}::text[])
  `;
  const missingUuids = (missing as { user_uuid: string }[]).map((r) => r.user_uuid);
  let cpfFetched = 0;
  if (missingUuids.length > 0) {
    const details = await fetchUserCpfs(missingUuids);
    for (const [uuid, d] of details) {
      cpfFetched++;
      await sql`
        UPDATE quinzena_card_map
        SET cpf = ${d.cpf},
            vex_name = COALESCE(NULLIF(${d.name}, ''), vex_name)
        WHERE user_uuid = ${uuid}
      `;
    }
  }

  return { groups: groups.length, cards_seen: upserted, cpf_fetched: cpfFetched, pruned, fresh_uuids: seen };
}

export async function loadCardMapRows(onlyUuids?: Set<string>): Promise<CardMapRow[]> {
  if (!sql) return [];
  const rows = onlyUuids
    ? await sql`SELECT * FROM quinzena_card_map WHERE user_uuid = ANY(${[...onlyUuids]}::text[])`
    : await sql`SELECT * FROM quinzena_card_map`;
  return rows as CardMapRow[];
}
