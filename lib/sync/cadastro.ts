// Cadastro (team-members) sync — moved verbatim from lib/pipeline/pipeline.ts.
import { sql } from '../db/neon';
import { API_URL, API_KEY, v2Headers } from './client';
import { getCurrentQuinzenaId } from '../pipeline/quinzena-dates';
import { getSituacaoMap, getRhInfoMap } from '../comprovantes/funcionarios';

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

  // Dedup por CPF: o VExpenses mantém registros duplicados de team-member
  // (mesmo CPF, um active e outro inactive — re-cadastro sem baixar o antigo).
  // O registro ATIVO é o vínculo operacional (cartões/prestações) e vence;
  // o desligamento real continua chegando pelo merge do RH abaixo.
  const memberByCpf = new Map<string, { name: string; active: boolean }>();
  for (const m of allMembers) {
    const cpf = String(m.cpf || '').replace(/\D/g, '');
    if (!cpf) continue;
    const active = m.active !== false;
    const cur = memberByCpf.get(cpf);
    if (!cur || (active && !cur.active)) {
      memberByCpf.set(cpf, { name: String(m.name || ''), active });
    }
  }
  const apiCpfActive = new Map<string, boolean>();
  for (const [cpf, m] of memberByCpf) apiCpfActive.set(cpf, m.active);

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
  }
  for (const [cpf, m] of memberByCpf) {
    if (!m.name.trim()) continue;
    const targetSituacao = m.active === false ? 'INATIVO' : 'ATIVO';
    const memberActive = m.active;
    const memberName = m.name;
    const rows = await db`
      INSERT INTO quinzena_cadastro (cpf, colaborador, situacao, updated_at)
      VALUES (${cpf}, ${memberName.toUpperCase()}, ${targetSituacao}, NOW())
      ON CONFLICT (cpf) DO UPDATE SET
        situacao = CASE
          WHEN ${memberActive === false} THEN 'INATIVO'
          WHEN quinzena_cadastro.situacao IS NULL OR quinzena_cadastro.situacao = '' THEN 'ATIVO'
          ELSE quinzena_cadastro.situacao
        END,
        updated_at = NOW()
      WHERE quinzena_cadastro.situacao IS DISTINCT FROM CASE
          WHEN ${memberActive === false} THEN 'INATIVO'
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

  // Merge situacao do RH (eqs_funcionarios.funcionarios) — fonte oficial de
  // desligamento/afastamento. O VExpenses mantém o cartão ativo após a
  // demissão, então RH não-ATIVO vence (INATIVO, PERÍCIA, CONTRATO SUSPENSO…).
  // RH ATIVO não reativa quem está INATIVO no cadastro (VExpenses inativo ou
  // baixa manual prevalecem); só preenche situacao vazia.
  let rhUpdated = 0;
  try {
    const curRows: { cpf: string; situacao: string | null }[] =
      await db`SELECT cpf, situacao FROM quinzena_cadastro WHERE cpf IS NOT NULL`;
    const cadSit = new Map<string, string>();
    for (const r of curRows) cadSit.set(r.cpf, (r.situacao ?? '').trim());
    const rhMap = await getSituacaoMap([...cadSit.keys()]);
    const updCpfs: string[] = [];
    const updSits: string[] = [];
    for (const [cpf, sit] of rhMap) {
      const rh = (sit || '').trim();
      if (!rh) continue;
      const cur = cadSit.get(cpf) || '';
      let next: string | null = null;
      if (rh.toUpperCase() !== 'ATIVO') next = rh;                    // RH marca desligamento/afastamento
      else if (!cur) next = 'ATIVO';                                 // só preenche vazio
      if (next !== null && next !== cur) { updCpfs.push(cpf); updSits.push(next); }
    }
    if (updCpfs.length) {
      await db.query(
        `UPDATE quinzena_cadastro c SET situacao = v.s, updated_at = NOW()
         FROM (SELECT unnest($1::text[]) AS cpf, unnest($2::text[]) AS s) v
         WHERE c.cpf = v.cpf`,
        [updCpfs, updSits]
      );
      rhUpdated = updCpfs.length;
      console.log(`[cadastro] situacao RH aplicada em ${rhUpdated} cadastros`);
    }
  } catch (e) {
    console.warn('[cadastro] merge de situacao RH falhou (segue com dados VExpenses):', e);
  }

  // Preenche centro_custo/regional vazios — membros sincronizados pela API
  // chegam sem nada (a API não traz CC). Fonte: RH eqs_funcionarios (cc) e,
  // para regional, o grupo do extrato (mesmo naming "REGIONAL XX" da planilha)
  // com fallback no sufixo da filial RH. Nunca sobrescreve valor existente
  // (planilha importada vence).
  let ccFilled = 0;
  try {
    const blankRows: { cpf: string; colaborador: string | null }[] = await db`
      SELECT cpf, colaborador FROM quinzena_cadastro
      WHERE cpf IS NOT NULL AND (
        centro_custo IS NULL OR centro_custo = '' OR
        regional IS NULL OR regional = ''
      )
    `;
    if (blankRows.length) {
      const rhInfo = await getRhInfoMap(blankRows.map((r) => r.cpf));
      const norm = (s: string | null | undefined) => (s || '')
        .toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      const grpRows: { usuario: string; grupo: string }[] = await db`
        SELECT DISTINCT ON (usuario) usuario, grupo
        FROM extrato_movimentacao
        WHERE grupo IS NOT NULL AND grupo <> ''
        ORDER BY usuario, data DESC
      `;
      const grpByName = new Map(grpRows.map((g) => [norm(g.usuario), g.grupo]));
      const FILIAL2REG: Record<string, string> = {
        RS: 'REGIONAL RS', SC: 'REGIONAL SC', SP: 'REGIONAL SP', MG: 'REGIONAL MG',
        PR: 'REGIONAL SC', BA: 'REGIONAL NE', AL: 'REGIONAL NE', PE: 'REGIONAL NE',
        CE: 'REGIONAL NE', RN: 'REGIONAL NE', GO: 'REGIONAL CLARO INFRA SUL',
        MS: 'REGIONAL CLARO INFRA SUL', MT: 'REGIONAL CLARO INFRA SUL',
      };
      for (const row of blankRows) {
        const info = rhInfo.get(row.cpf);
        const cc = info?.cc && info.cc !== 'Sem Centro de custo' ? info.cc : null;
        let reg = grpByName.get(norm(row.colaborador)) || null;
        if (!reg && info?.filial) {
          const m = info.filial.match(/-\s*([A-Z]{2})\s*$/);
          if (m) reg = FILIAL2REG[m[1]] || null;
        }
        if (!cc && !reg) continue;
        await db`
          UPDATE quinzena_cadastro SET
            centro_custo = CASE WHEN centro_custo IS NULL OR centro_custo = '' THEN ${cc} ELSE centro_custo END,
            regional = CASE WHEN regional IS NULL OR regional = '' THEN ${reg} ELSE regional END,
            updated_at = NOW()
          WHERE cpf = ${row.cpf}
        `;
        ccFilled++;
      }
      if (ccFilled) console.log(`[cadastro] centro_custo/regional preenchidos em ${ccFilled} cadastros`);
    }
  } catch (e) {
    console.warn('[cadastro] fill de centro_custo/regional falhou:', e);
  }

  // Base do snapshot por período: o cadastro canônico (quinzena_cadastro).
  // Antes isso lia da própria quinzena_controle_snapshot — que nunca foi
  // populada, então a tabela ficava vazia pra sempre (ovo-e-galinha).
  const cadastroRows = await db`
    SELECT cpf, colaborador, situacao, status_cartao,
           regional, centro_custo, gestor, diretor
    FROM quinzena_cadastro
    WHERE cpf IS NOT NULL
  `;
  // Complemento: CPFs que saíram do cadastro mas existiam em snapshots antigos
  // (histórico importado pela tool manual, se houver).
  const lastSnapshots = await db`
    SELECT DISTINCT ON (cpf)
      cpf, colaborador, situacao, status_cartao,
      regional, centro_custo, gestor, diretor
    FROM quinzena_controle_snapshot
    WHERE cpf IS NOT NULL
    ORDER BY cpf, year DESC, month DESC, quinzena DESC
  `;
  const seenCpfs = new Set(cadastroRows.map((r: any) => r.cpf));
  const seedRows = [
    ...cadastroRows,
    ...lastSnapshots.filter((s: any) => !seenCpfs.has(s.cpf)),
  ];

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

  // Situacao do RH (eqs_funcionarios) — mesma regra do merge no cadastro:
  // RH não-ATIVO vence; caso contrário vale VExpenses/snapshot.
  let rhMapControle = new Map<string, string>();
  try {
    rhMapControle = await getSituacaoMap(
      seedRows.map((s: any) => s.cpf).filter(Boolean)
    );
  } catch (e) {
    console.warn('[cadastro] situacao RH indisponível para snapshot controle:', e);
  }

  let upserted = 0;
  for (const snap of seedRows) {
    // Update situacao based on API active status
    const apiActive = apiCpfActive.get(snap.cpf);
    const rh = (rhMapControle.get(snap.cpf) || '').trim();
    const situacao = rh && rh.toUpperCase() !== 'ATIVO' ? rh
      : apiActive === false ? 'INATIVO' : (snap.situacao || (rh || 'ATIVO'));

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
    seed_from_cadastro: cadastroRows.length,
    seed_from_last_snapshot: lastSnapshots.length,
    rh_situacao_aplicada: rhUpdated,
    upserted,
    quinzena: quinzenaId,
  };
}
