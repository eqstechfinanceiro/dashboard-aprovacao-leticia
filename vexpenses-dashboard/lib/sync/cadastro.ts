// Cadastro (team-members) sync — moved verbatim from lib/pipeline/pipeline.ts.
import { sql } from '../db/neon';
import { API_URL, API_KEY, v2Headers } from './client';
import { getCurrentQuinzenaId } from '../pipeline/quinzena-dates';

/** Refresh cadastro data — merge API team-members with last snapshot */
export async function refreshCadastro(): Promise<Record<string, unknown>> {
  if (!sql) throw new Error('Database not available');
  if (!API_KEY) throw new Error('VEXPENSES_API_KEY not configured');
  const db = sql;

  // Fetch all team members from API
  let allMembers: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const resp = await fetch(
      `${API_URL}/v2/team-members?paginate=true&page=${page}&per_page=${perPage}`,
      {
        headers: v2Headers(),
        signal: AbortSignal.timeout(120000),
      }
    );
    if (!resp.ok) throw new Error(`Team members API returned ${resp.status}`);
    const data: any = await resp.json();
    const members = data.data || [];
    allMembers = allMembers.concat(members);

    const lastPage = data.last_page || 1;
    if (page >= lastPage) break;
    page++;
  }

  // Build CPF → active map from API
  const apiCpfActive = new Map<string, boolean>();
  for (const m of allMembers) {
    if (m.cpf) apiCpfActive.set(m.cpf, m.active !== false);
  }

  // Guarantee every VExpenses member with a CPF exists in quinzena_cadastro.
  // Without a cadastro row, resolveCpfByName cannot map their card
  // transactions and the balance silently vanishes (or worse, leaks to a
  // same-first-name colleague). New members land here within one WARM cycle.
  // On conflict: never overwrite colaborador/regional/gestor (planilha data);
  // only push INATIVO when the API says the member is inactive, or fill
  // ATIVO when situacao is empty.
  let cadastroInserted = 0;
  const noCpf: string[] = [];
  for (const m of allMembers) {
    const cpf = String(m.cpf || '').replace(/\D/g, '');
    if (!cpf || !String(m.name || '').trim()) {
      noCpf.push(m.name ? String(m.name) : `(sem nome) cpf=${cpf || '-'}`);
      continue;
    }
    const targetSituacao = m.active === false ? 'INATIVO' : 'ATIVO';
    const rows = await db`
      INSERT INTO quinzena_cadastro (cpf, colaborador, situacao, updated_at)
      VALUES (${cpf}, ${String(m.name || '').toUpperCase()}, ${targetSituacao}, NOW())
      ON CONFLICT (cpf) DO UPDATE SET
        situacao = CASE
          WHEN ${m.active === false} THEN 'INATIVO'
          WHEN quinzena_cadastro.situacao IS NULL OR quinzena_cadastro.situacao = '' THEN 'ATIVO'
          ELSE quinzena_cadastro.situacao
        END,
        updated_at = NOW()
      WHERE quinzena_cadastro.situacao IS DISTINCT FROM CASE
          WHEN ${m.active === false} THEN 'INATIVO'
          WHEN quinzena_cadastro.situacao IS NULL OR quinzena_cadastro.situacao = '' THEN 'ATIVO'
          ELSE quinzena_cadastro.situacao
        END
      RETURNING (xmax = 0) AS inserted
    `;
    if (rows.length && rows[0]?.inserted) cadastroInserted++;
  }
  if (cadastroInserted > 0) {
    console.log(`[cadastro] ${cadastroInserted} novos membros inseridos no quinzena_cadastro`);
  }
  if (noCpf.length) {
    console.log(`[cadastro] members sem CPF ignorados (${noCpf.length}): ${noCpf.join(', ')}`);
  }

  // Get the most recent cadastral data from existing snapshots
  const lastSnapshots = await db`
    SELECT DISTINCT ON (cpf)
      cpf, colaborador, situacao, status_cartao,
      regional, centro_custo, gestor, diretor
    FROM quinzena_controle_snapshot
    WHERE cpf IS NOT NULL
    ORDER BY cpf, year DESC, month DESC, quinzena DESC
  `;

  // Determine target quinzena
  const quinzenaId = getCurrentQuinzenaId();
  const [qYear, qMonth, qQuinzena] = quinzenaId.split('-');
  const year = parseInt(qYear);
  const month = parseInt(qMonth);
  const quinzena = parseInt(qQuinzena);

  // Delete existing API-source snapshot for this quinzena
  await db`
    DELETE FROM quinzena_controle_snapshot
    WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      AND import_source = 'api'
  `;

  let upserted = 0;
  for (const snap of lastSnapshots) {
    // Update situacao based on API active status
    const apiActive = apiCpfActive.get(snap.cpf);
    const situacao = apiActive === false ? 'INATIVO' : (snap.situacao || 'ATIVO');

    await db`
      INSERT INTO quinzena_controle_snapshot
        (year, month, quinzena, cpf, colaborador, situacao, status_cartao,
         regional, centro_custo, gestor, diretor,
         saldo_prestacao, saldo_cartao, saldo_final,
         import_source, imported_at)
      VALUES (
        ${year}, ${month}, ${quinzena},
        ${snap.cpf},
        ${snap.colaborador},
        ${situacao},
        ${snap.status_cartao},
        ${snap.regional},
        ${snap.centro_custo},
        ${snap.gestor},
        ${snap.diretor},
        0, 0, 0,
        'api', NOW()
      )
      ON CONFLICT (year, month, quinzena, cpf) DO NOTHING
    `;
    upserted++;
  }

  return {
    team_members_api: allMembers.length,
    cadastro_inserted: cadastroInserted,
    cadastro_no_cpf: noCpf.length,
    cadastro_from_last_snapshot: lastSnapshots.length,
    upserted,
    quinzena: quinzenaId,
  };
}
