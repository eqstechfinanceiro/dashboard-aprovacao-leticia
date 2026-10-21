/**
 * syncBorderoStatus — verificação em batch do borderô de pagamento (SEA/SE2)
 * das notas fiscais que ainda interessam ao fluxo de correção:
 *
 *   alvo = review_status em ('pendente','falha_tecnica','confirmado_erro',
 *   'cancelado')  ∪  notas que constam em borderô (continua vigiando até o
 *   SEA sumir — detecta remoção feita pelo contas a pagar no Protheus).
 *
 * Saída é cacheada em fiscal_bordero_status: a página /fiscal mostra o badge
 * sem consultar o TOTVS e a fila /borderos do contas a pagar lê daqui.
 *
 * Transições detectadas:
 *   entrou em borderô  → notifica módulo 'borderos' (fila de remoção)
 *   saiu do borderô    → removida_detectada_at + notifica 'fiscal'
 *   título baixado     → pago=true + notifica ambos (exige estorno)
 *
 * Worker-safe: relative imports only, sem Next.js APIs.
 */
import { sql } from '../db/neon';
import { ensureFiscalTables } from './fiscal-db';
import { fetchBorderoStatusBatch, type BorderoNotaRef, type BorderoInfo } from '../conferencia/totvs';
import { ensureAuditTable } from '../db/audit';
import { upsertNotification, resolveByDedup } from '../sync/notifications';

const trim = (v: any) => (v === null || v === undefined ? '' : String(v).trim());

export interface BorderoSyncResult {
  checked: number;
  em_bordero: number;
  removidas: number;
  pagas: number;
  errors: string[];
}

// Código SA2 do fornecedor conforme o tipo da nota — serviço guarda o NOME
// em `fornecedor` e o código em extra.fornecedor_cod/recno.
export function fornecedorCodigoNota(n: { tipo: string; fornecedor: any; extra: any }): string {
  if (n.tipo === 'servico') return trim(n.extra?.fornecedor_cod || n.extra?.recno || '');
  return trim(n.fornecedor);
}

export function lojaNota(n: { extra: any }): string {
  return trim(n.extra?.f1_loja || n.extra?.loja || '');
}

/** Usuários ativos com um módulo — destino das notificações in-app. */
export async function userIdsWithModule(module: string): Promise<number[]> {
  if (!sql) return [];
  const rows = await sql`
    SELECT id FROM app_users
    WHERE active = TRUE
      AND (role = 'admin' OR allowed_modules @> ${JSON.stringify([module])}::jsonb)
  `;
  return rows.map((r: any) => r.id as number);
}

async function auditSys(action: string, notaId: number, details: Record<string, unknown>) {
  if (!sql) return;
  try {
    await ensureAuditTable();
    await sql`
      INSERT INTO audit_log (user_id, user_email, user_name, user_role, action, entity_type, entity_id, details)
      VALUES (NULL, NULL, 'sync-worker', 'system', ${action}, 'fiscal_nota', ${String(notaId)}, ${JSON.stringify(details)}::jsonb)
    `;
  } catch {}
}

export async function syncBorderoStatus(opts: { limit?: number } = {}): Promise<BorderoSyncResult> {
  const out: BorderoSyncResult = { checked: 0, em_bordero: 0, removidas: 0, pagas: 0, errors: [] };
  if (!sql) { out.errors.push('DB indisponível'); return out; }
  await ensureFiscalTables();

  const notas = await sql`
    SELECT n.id, n.doc, n.serie, n.fornecedor, n.tipo, n.chave_acesso, n.extra, n.review_status,
           bs.em_bordero AS prev_em_bordero, bs.pago AS prev_pago,
           bs.remocao_confirmada_at, bs.removida_detectada_at
    FROM fiscal_notas n
    LEFT JOIN fiscal_bordero_status bs ON bs.nota_id = n.id
    WHERE n.review_status IN ('pendente','falha_tecnica','confirmado_erro','cancelado')
       OR bs.em_bordero = TRUE
    ORDER BY n.id
  `;
  const alvo = notas.slice(0, opts.limit ?? 2000);
  if (!alvo.length) return out;

  const refs: BorderoNotaRef[] = alvo.map((n: any) => ({
    id: n.id as number,
    doc: trim(n.doc),
    serie: trim(n.serie),
    fornec: fornecedorCodigoNota(n),
    loja: lojaNota(n),
    empresa: trim(n.extra?.empresa).toUpperCase(),
  }));

  const { porNota, errors } = await fetchBorderoStatusBatch(refs);
  out.errors.push(...errors);
  out.checked = alvo.length;

  // Destinatários calculados uma vez por ciclo.
  const fiscalUsers = await userIdsWithModule('fiscal');
  const borderoUsers = await userIdsWithModule('borderos');

  for (const n of alvo as any[]) {
    const borderos: BorderoInfo[] = porNota.get(n.id) || [];
    const emBordero = borderos.length > 0;
    const pago = borderos.some((b) => !!b.baixa);
    const prevEm = !!n.prev_em_bordero;
    const prevPago = !!n.prev_pago;
    if (emBordero) out.em_bordero++;

    const removidaAgora = prevEm && !emBordero && !n.removida_detectada_at;
    const pagaAgora = pago && !prevPago;
    const entrouAgora = emBordero && !prevEm;

    await sql`
      INSERT INTO fiscal_bordero_status
        (nota_id, em_bordero, pago, borderos, checked_at, check_error, removida_detectada_at)
      VALUES (${n.id}, ${emBordero}, ${pago}, ${JSON.stringify(borderos)}::jsonb, NOW(), NULL,
              ${removidaAgora ? new Date().toISOString() : n.removida_detectada_at})
      ON CONFLICT (nota_id) DO UPDATE SET
        em_bordero = EXCLUDED.em_bordero,
        pago = EXCLUDED.pago,
        borderos = EXCLUDED.borderos,
        checked_at = NOW(),
        check_error = NULL,
        removida_detectada_at = EXCLUDED.removida_detectada_at
    `;

    const label = `NF ${n.doc}${n.serie ? '/' + n.serie : ''}`;

    if (entrouAgora && ['confirmado_erro', 'cancelado'].includes(n.review_status)) {
      // Nota com problema entrou em pagamento — fila de remoção do AP.
      for (const uid of borderoUsers) {
        await upsertNotification(uid, {
          type: 'fiscal_bordero',
          title: `${label} em borderô — remover`,
          body: `Nota com ${n.review_status === 'cancelado' ? 'cancelamento' : 'erro confirmado'} entrou em borderô de pagamento. Remover o título pra liberar a correção.`,
          link: '/borderos',
          dedupKey: `bordero:remover:${n.id}`,
        });
      }
    }
    if (removidaAgora) {
      out.removidas++;
      await auditSys('fiscal.bordero_removida_auto', n.id, { doc: n.doc, serie: n.serie });
      await resolveByDedup(`bordero:remover:${n.id}`);
      for (const uid of fiscalUsers) {
        await upsertNotification(uid, {
          type: 'fiscal_bordero',
          title: `${label} saiu do borderô`,
          body: 'O título foi removido do borderô — a correção/cancelamento pode prosseguir.',
          link: '/fiscal',
          dedupKey: `bordero:removida:${n.id}`,
        });
      }
    }
    if (pagaAgora) {
      out.pagas++;
      await auditSys('fiscal.bordero_paga', n.id, { doc: n.doc, serie: n.serie, borderos });
      const msg = 'O título foi baixado (pago) — correção exige estorno, não remoção de borderô.';
      for (const uid of [...new Set([...fiscalUsers, ...borderoUsers])]) {
        await upsertNotification(uid, {
          type: 'fiscal_bordero',
          title: `${label} paga em borderô`,
          body: msg,
          link: '/borderos',
          dedupKey: `bordero:paga:${n.id}`,
        });
      }
    }
  }
  return out;
}
