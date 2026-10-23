// Cliente da API VExpenses Pay (api.vexpenses.com/v3/pay/*) — movimentação de
// dinheiro: pool EQS → grupo de cartões → cartão do funcionário.
// Contrato capturado/provado em docs/VEXPENSES_PAY_API_AUTOCARGA.md.
//
// Auth: um único cookie `laravel_token` basta para leitura E escrita — o mesmo
// token que a extensão sincroniza em vexpenses_tokens e que
// lib/api/laravel-token.ts já rotaciona.

import { getLaravelCookieString } from '@/lib/api/laravel-token';

const BASE = 'https://api.vexpenses.com';
const FETCH_TIMEOUT_MS = 30_000;

export class VexpayAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VexpayAuthError';
  }
}

export class VexpayError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'VexpayError';
  }
}

// Envelope padrão das respostas Pay: {success, data?, errors?}
export interface VexEnvelope<T = any> {
  success: boolean;
  data?: T;
  errors?: { code?: number; message?: string }[];
  message?: string;
}

async function vexFetch<T = any>(path: string, init: RequestInit = {}, _retried = false): Promise<T> {
  const cookie = await getLaravelCookieString();
  if (!cookie) {
    throw new VexpayAuthError(
      'Nenhum laravel_token válido no banco — sincronize a sessão pela extensão VExpenses.',
    );
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Cookie: cookie,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e: any) {
    throw new VexpayError(0, null, `Falha de rede em ${path}: ${e?.message ?? e}`);
  }
  if (res.status === 401 || res.status === 403) {
    // 403 transitório: a API derruba a sessão por alguns segundos em bursts de
    // leitura (refresh do card_map). Um retry com backoff resolve a janela;
    // um token realmente morto falha de novo e vira VexpayAuthError.
    if (res.status === 403 && !_retried) {
      await new Promise((r) => setTimeout(r, 2000));
      return vexFetch<T>(path, init, true);
    }
    throw new VexpayAuthError(`laravel_token expirado/inválido (HTTP ${res.status})`);
  }
  if (res.status === 429 && !_retried) {
    await new Promise((r) => setTimeout(r, 3000));
    return vexFetch<T>(path, init, true);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new VexpayError(res.status, body, `VExpenses ${path} → HTTP ${res.status}`);
  }
  return body as T;
}

// ---- Leituras ---------------------------------------------------------------

export async function getPoolBalance(): Promise<number> {
  const j = await vexFetch<any>('/v3/pay/company/balance');
  return Number(j?.data?.amount ?? j?.amount ?? 0);
}

export interface CardGroup {
  id: string;          // uuid do card-group
  name: string;
  balance_id: string;  // conta de saldo do grupo (destino do deposit)
}

export async function listCardGroups(): Promise<CardGroup[]> {
  const out: CardGroup[] = [];
  for (let page = 1; page <= 20; page++) {
    const j = await vexFetch<any>(
      `/v3/pay/v2/app/card-groups?page=${page}&limit=100&ordenation_type=ASC`,
    );
    // Envelope paginado Laravel: {data: {objects: [...]}, total, current_page…}
    const objs: any[] = j?.data?.objects ?? j?.objects ?? [];
    for (const g of objs) {
      if (g?.id && g?.balance_id) {
        out.push({ id: g.id, name: g.name ?? '', balance_id: g.balance_id });
      }
    }
    const total = Number(j?.total ?? j?.data?.total ?? 0);
    if (objs.length === 0 || (total > 0 && out.length >= total)) break;
  }
  return out;
}

export interface PayCard {
  user_uuid: string;         // individual.user_id — ponte pra /v3/pay/users/{uuid}
  user_name: string;
  account_id: string | null;
  card_number: string;       // últimos dígitos exibidos
  card_status: string;       // ACTIVE / BLOCKED / …
  account_status: string;
  balance_account_id: string | null; // balances[0].id — destino do CREDIT
  card_group_id: string;
}

export async function listGroupAccounts(cardGroupId: string): Promise<PayCard[]> {
  const out: PayCard[] = [];
  for (let page = 1; page <= 30; page++) {
    const j = await vexFetch<any>(
      `/v3/pay/v2/app/accounts?card_group_id=${cardGroupId}&page=${page}&limit=100&sort_order=ASC`,
    );
    const objs: any[] = j?.data?.objects ?? j?.objects ?? [];
    for (const o of objs) {
      const ind = o?.individual ?? {};
      const acc = ind.account ?? o?.account ?? {};
      out.push({
        user_uuid: ind.user_id ?? o?.user_id ?? '',
        user_name: ind.user_name ?? o?.user_name ?? '',
        account_id: acc.id ?? null,
        card_number: String(acc.card_number ?? ''),
        card_status: String(acc.card_status ?? ''),
        account_status: String(acc.status ?? o?.status ?? ind.status ?? ''),
        balance_account_id: acc.balances?.[0]?.id ?? null,
        card_group_id: cardGroupId,
      });
    }
    const total = Number(j?.total ?? j?.data?.total ?? 0);
    if (objs.length === 0 || (total > 0 && out.length >= total)) break;
  }
  return out;
}

export interface PayUserDetail {
  uuid: string;
  name: string;
  cpf: string | null; // dígitos apenas
  email: string | null;
}

export async function getPayUser(userUuid: string): Promise<PayUserDetail | null> {
  const j = await vexFetch<any>(`/v3/pay/users/${userUuid}`);
  const u = j?.data ?? j;
  if (!u || typeof u !== 'object') return null;
  const cpfDigits = String(u.cpf ?? '').replace(/\D/g, '');
  return {
    uuid: userUuid,
    name: String(u.name ?? u.user_name ?? ''),
    cpf: cpfDigits ? cpfDigits.padStart(11, '0') : null,
    email: u.email ?? null,
  };
}

// Saldo LIVRE disponível em cada grupo (não o já distribuído nos cartões).
export async function getGroupBalances(cardGroupIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (cardGroupIds.length === 0) return map;
  const j = await vexFetch<any>(
    '/v3/pay/v2/app/company/balance/multiple',
    { method: 'POST', body: JSON.stringify({ card_group_ids: cardGroupIds }) },
  );
  const arr: any[] = Array.isArray(j?.data) ? j.data : (j?.data?.objects ?? j?.objects ?? []);
  for (const r of arr) {
    const gid = r?.card_group_id ?? r?.cardGroupId ?? r?.id;
    if (gid) map.set(gid, Number(r.amount ?? r.balance ?? 0));
  }
  return map;
}

// ---- Escritas (todas provadas "Approved" no contrato) -------------------------

export interface WriteResult {
  ok: boolean;
  transaction_id: string | null;
  response: VexEnvelope;
}

function parseWriteEnvelope(j: VexEnvelope): WriteResult {
  const tx = (j?.data as any)?.transaction_id ?? null;
  return { ok: j?.success === true, transaction_id: tx, response: j };
}

export async function depositToGroup(
  balanceAccountId: string,
  amount: number,
  description: string,
): Promise<WriteResult> {
  const j = await vexFetch<VexEnvelope>('/v3/pay/accounts/balances/deposit', {
    method: 'POST',
    body: JSON.stringify({ balance_account_id: balanceAccountId, amount, description }),
  });
  return parseWriteEnvelope(j);
}

export async function withdrawFromGroup(
  balanceAccountId: string,
  amount: number,
  description: string,
): Promise<WriteResult> {
  const j = await vexFetch<VexEnvelope>('/v3/pay/accounts/balances/withdrawal', {
    method: 'POST',
    body: JSON.stringify({ balance_account_id: balanceAccountId, amount, description }),
  });
  return parseWriteEnvelope(j);
}

export interface TransferItem {
  balance_account_id: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
}

export interface TransferSuccessItem {
  balance_account_id: string;
  transaction_id: string | null;
  user_name?: string;
  amount?: number;
  response_code?: number;
}

export interface TransferFailureItem {
  balance_account_id: string;
  code: number | null;
  message: string;
}

export interface TransferBatchResult {
  callOk: boolean;            // envelope top-level success
  callError: string | null;   // erro de nível de chamada (ex.: rate-limit global)
  callErrorCode: number | null;
  success: TransferSuccessItem[];
  failure: TransferFailureItem[];
  raw: VexEnvelope;
}

export function isRateLimitCode(code: number | null | undefined): boolean {
  return code === 147002002;
}

export async function transfers(items: TransferItem[]): Promise<TransferBatchResult> {
  const j = await vexFetch<VexEnvelope>('/v3/pay/company/transfers', {
    method: 'POST',
    body: JSON.stringify(items),
  });
  const data: any = j?.data ?? {};
  const failure: TransferFailureItem[] = (data.failure ?? []).map((f: any) => ({
    balance_account_id: f?.balance_account_id ?? '',
    code: f?.code ?? f?.errors?.[0]?.code ?? null,
    message:
      f?.message ?? f?.errors?.[0]?.message ?? f?.response_code_message ?? 'falha na transferência',
  }));
  // Falha no nível da chamada: {success:false, errors:[{code, message}]} — ex.:
  // rate-limit 147002002 quando o mesmo cartão é tocado 2x em < ~60s.
  const topErr = j?.errors?.[0] ?? null;
  return {
    callOk: j?.success === true,
    callError: topErr?.message ?? j?.message ?? null,
    callErrorCode: topErr?.code ?? null,
    success: (data.success ?? []).map((s: any) => ({
      balance_account_id: s?.balance_account_id ?? '',
      transaction_id: s?.transaction_id ?? null,
      user_name: s?.user_name,
      amount: s?.amount,
      response_code: s?.response_code,
    })),
    failure,
    raw: j,
  };
}
