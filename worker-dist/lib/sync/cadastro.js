"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshCadastro = refreshCadastro;
// Cadastro (team-members) sync — moved verbatim from lib/pipeline/pipeline.ts.
const neon_1 = require("../db/neon");
const client_1 = require("./client");
const quinzena_dates_1 = require("../pipeline/quinzena-dates");
const funcionarios_1 = require("../comprovantes/funcionarios");
/** Refresh cadastro data — merge API team-members with last snapshot */
async function refreshCadastro() {
    if (!neon_1.sql)
        throw new Error('Database not available');
    if (!client_1.API_KEY)
        throw new Error('VEXPENSES_API_KEY not configured');
    const db = neon_1.sql;
    // Fetch all team members from API
    let allMembers = [];
    let page = 1;
    const perPage = 100;
    while (true) {
        const resp = await fetch(`${client_1.API_URL}/v2/team-members?paginate=true&page=${page}&per_page=${perPage}`, {
            headers: (0, client_1.v2Headers)(),
            signal: AbortSignal.timeout(120000),
        });
        if (!resp.ok)
            throw new Error(`Team members API returned ${resp.status}`);
        const data = await resp.json();
        const members = data.data || [];
        allMembers = allMembers.concat(members);
        const lastPage = data.last_page || 1;
        if (page >= lastPage)
            break;
        page++;
    }
    // Build CPF → active map from API
    const apiCpfActive = new Map();
    for (const m of allMembers) {
        if (m.cpf)
            apiCpfActive.set(m.cpf, m.active !== false);
    }
    // Guarantee every VExpenses member with a CPF exists in quinzena_cadastro.
    // Without a cadastro row, resolveCpfByName cannot map their card
    // transactions and the balance silently vanishes (or worse, leaks to a
    // same-first-name colleague). New members land here within one WARM cycle.
    // On conflict: never overwrite colaborador/regional/gestor (planilha data);
    // only push INATIVO when the API says the member is inactive, or fill
    // ATIVO when situacao is empty.
    let cadastroInserted = 0;
    const noCpf = [];
    for (const m of allMembers) {
        const cpf = String(m.cpf || '').replace(/\D/g, '');
        if (!cpf || !String(m.name || '').trim()) {
            noCpf.push(m.name ? String(m.name) : `(sem nome) cpf=${cpf || '-'}`);
            continue;
        }
        const targetSituacao = m.active === false ? 'INATIVO' : 'ATIVO';
        const rows = await db `
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
        if (rows.length && rows[0]?.inserted)
            cadastroInserted++;
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
        const curRows = await db `SELECT cpf, situacao FROM quinzena_cadastro WHERE cpf IS NOT NULL`;
        const cadSit = new Map();
        for (const r of curRows)
            cadSit.set(r.cpf, (r.situacao ?? '').trim());
        const rhMap = await (0, funcionarios_1.getSituacaoMap)([...cadSit.keys()]);
        const updCpfs = [];
        const updSits = [];
        for (const [cpf, sit] of rhMap) {
            const rh = (sit || '').trim();
            if (!rh)
                continue;
            const cur = cadSit.get(cpf) || '';
            let next = null;
            if (rh.toUpperCase() !== 'ATIVO')
                next = rh; // RH marca desligamento/afastamento
            else if (!cur)
                next = 'ATIVO'; // só preenche vazio
            if (next !== null && next !== cur) {
                updCpfs.push(cpf);
                updSits.push(next);
            }
        }
        if (updCpfs.length) {
            await db.query(`UPDATE quinzena_cadastro c SET situacao = v.s, updated_at = NOW()
         FROM (SELECT unnest($1::text[]) AS cpf, unnest($2::text[]) AS s) v
         WHERE c.cpf = v.cpf`, [updCpfs, updSits]);
            rhUpdated = updCpfs.length;
            console.log(`[cadastro] situacao RH aplicada em ${rhUpdated} cadastros`);
        }
    }
    catch (e) {
        console.warn('[cadastro] merge de situacao RH falhou (segue com dados VExpenses):', e);
    }
    // Base do snapshot por período: o cadastro canônico (quinzena_cadastro).
    // Antes isso lia da própria quinzena_controle_snapshot — que nunca foi
    // populada, então a tabela ficava vazia pra sempre (ovo-e-galinha).
    const cadastroRows = await db `
    SELECT cpf, colaborador, situacao, status_cartao,
           regional, centro_custo, gestor, diretor
    FROM quinzena_cadastro
    WHERE cpf IS NOT NULL
  `;
    // Complemento: CPFs que saíram do cadastro mas existiam em snapshots antigos
    // (histórico importado pela tool manual, se houver).
    const lastSnapshots = await db `
    SELECT DISTINCT ON (cpf)
      cpf, colaborador, situacao, status_cartao,
      regional, centro_custo, gestor, diretor
    FROM quinzena_controle_snapshot
    WHERE cpf IS NOT NULL
    ORDER BY cpf, year DESC, month DESC, quinzena DESC
  `;
    const seenCpfs = new Set(cadastroRows.map((r) => r.cpf));
    const seedRows = [
        ...cadastroRows,
        ...lastSnapshots.filter((s) => !seenCpfs.has(s.cpf)),
    ];
    // Determine target quinzena
    const quinzenaId = (0, quinzena_dates_1.getCurrentQuinzenaId)();
    const [qYear, qMonth, qQuinzena] = quinzenaId.split('-');
    const year = parseInt(qYear);
    const month = parseInt(qMonth);
    const quinzena = parseInt(qQuinzena);
    // Delete existing API-source snapshot for this quinzena
    await db `
    DELETE FROM quinzena_controle_snapshot
    WHERE year = ${year} AND month = ${month} AND quinzena = ${quinzena}
      AND import_source = 'api'
  `;
    // Situacao do RH (eqs_funcionarios) — mesma regra do merge no cadastro:
    // RH não-ATIVO vence; caso contrário vale VExpenses/snapshot.
    let rhMapControle = new Map();
    try {
        rhMapControle = await (0, funcionarios_1.getSituacaoMap)(seedRows.map((s) => s.cpf).filter(Boolean));
    }
    catch (e) {
        console.warn('[cadastro] situacao RH indisponível para snapshot controle:', e);
    }
    let upserted = 0;
    for (const snap of seedRows) {
        // Update situacao based on API active status
        const apiActive = apiCpfActive.get(snap.cpf);
        const rh = (rhMapControle.get(snap.cpf) || '').trim();
        const situacao = rh && rh.toUpperCase() !== 'ATIVO' ? rh
            : apiActive === false ? 'INATIVO' : (snap.situacao || (rh || 'ATIVO'));
        await db `
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
