"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consultarPorCpf = consultarPorCpf;
exports.consultarPorNome = consultarPorNome;
exports.consultarPorNomeSeguro = consultarPorNomeSeguro;
exports.getSituacaoMap = getSituacaoMap;
exports.listFuncionariosForExport = listFuncionariosForExport;
exports.searchFuncionarios = searchFuncionarios;
const pg_1 = require("pg");
// Pool separado para o banco eqs_funcionarios (clone do banco interno de RH)
let pool = null;
function getPool() {
    if (!pool) {
        const url = process.env.FUNCIONARIOS_DATABASE_URL
            || (process.env.NEON_DATABASE_URL || '').replace(/\/[^/?]+(\?|$)/, '/eqs_funcionarios$1');
        if (!url)
            throw new Error('NEON_DATABASE_URL/FUNCIONARIOS_DATABASE_URL não configurado');
        pool = new pg_1.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
    }
    return pool;
}
function mapRow(r) {
    return {
        cpf: String(r.cpf ?? ''),
        nome: String(r.funcionario ?? ''),
        cc: String(r.cc ?? ''),
        regiao: String(r.regiao_pcs ?? ''),
        filial: String(r.filial ?? ''),
        situacao: String(r.situacao ?? ''),
        cargo: String(r.cargo ?? ''),
        banco: String(r.banco ?? ''),
        agencia: String(r.agencia ?? ''),
        conta: String(r.conta ?? ''),
    };
}
/** Lookup por CPF — equivalente a conexaoDB.consultar_db. Retorna null se não achar. */
async function consultarPorCpf(cpf) {
    const rows = await getPool().query('SELECT cpf, funcionario, cc, regiao_pcs, filial, situacao, cargo, banco, agencia, conta FROM funcionarios WHERE cpf = $1 LIMIT 1', [cpf]);
    return rows.rows.length > 0 ? mapRow(rows.rows[0]) : null;
}
/** Lookup por nome parcial — equivalente a conexaoDB.consultar_db_nome. */
async function consultarPorNome(nomeParcial) {
    const rows = await getPool().query('SELECT cpf, funcionario, cc, regiao_pcs, filial, situacao, cargo, banco, agencia, conta FROM funcionarios WHERE funcionario ILIKE $1 LIMIT 1', [`%${nomeParcial}%`]);
    return rows.rows.length > 0 ? mapRow(rows.rows[0]) : null;
}
function normalizarNome(s) {
    return s
        .toUpperCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Z ]/g, ' ')
        .split(' ')
        .filter((w) => w.length > 1);
}
/**
 * Lookup por nome com tolerância a truncamento (comprovantes cortam o nome em ~35 chars)
 * e verificação de compatibilidade: todo token do nome do comprovante precisa existir
 * no nome do funcionário (evita enviar comprovante para a pessoa errada).
 * Tenta prefixos progressivamente menores até achar um candidato compatível.
 */
async function consultarPorNomeSeguro(nomeComprovante) {
    const tokens = normalizarNome(nomeComprovante);
    if (tokens.length < 2)
        return null;
    for (let len = tokens.length; len >= 2; len--) {
        const termo = tokens.slice(0, len).join(' ');
        const cand = await consultarPorNome(termo);
        if (!cand)
            continue;
        const candTokens = new Set(normalizarNome(cand.nome));
        if (tokens.every((t) => candTokens.has(t)))
            return cand;
        // tolera o último token cortado no meio (ex.: 'MARLETE TERESINHA D' vs '... DE SOUZA')
        const ultimo = tokens[tokens.length - 1];
        const semUltimo = tokens.slice(0, -1);
        if (semUltimo.every((t) => candTokens.has(t)) &&
            [...candTokens].some((t) => t.startsWith(ultimo) || ultimo.startsWith(t))) {
            return cand;
        }
    }
    return null;
}
/**
 * Mapa cpf → situacao do RH (eqs_funcionarios) para merge no cadastro da
 * quinzena. Demissões e afastamentos (PERÍCIA, CONTRATO SUSPENSO, …) são
 * verdade do banco da empresa — o VExpenses mantém o cartão ativo mesmo
 * depois do desligamento, então esta fonte vence.
 */
async function getSituacaoMap(cpfs) {
    if (!cpfs.length)
        return new Map();
    const rows = await getPool().query('SELECT cpf, situacao FROM funcionarios WHERE cpf = ANY($1)', [cpfs]);
    const map = new Map();
    for (const r of rows.rows)
        map.set(String(r.cpf), String(r.situacao ?? ''));
    return map;
}
/** Export completo (sem paginação) para o botão de Excel — respeita a busca. */
async function listFuncionariosForExport(q) {
    const p = getPool();
    const params = [];
    let where = '';
    if (q) {
        params.push(`%${q}%`, q.replace(/\D/g, '') || '__none__');
        where = `WHERE funcionario ILIKE $1 OR cpf LIKE '%' || $2 || '%' OR cc ILIKE $1 OR regiao_pcs ILIKE $1`;
    }
    const rows = await p.query(`SELECT funcionario, cpf, cc, regiao_pcs, filial, empresa, cargo, funcao, situacao, admissao, demissao, banco, agencia, conta
     FROM funcionarios ${where} ORDER BY funcionario`, params);
    return rows.rows;
}
/** Busca para a aba de funcionários da página. */
async function searchFuncionarios(q, limit = 50, offset = 0) {
    const p = getPool();
    const params = [];
    let where = '';
    if (q) {
        params.push(`%${q}%`, q.replace(/\D/g, '') || '__none__');
        where = `WHERE funcionario ILIKE $1 OR cpf LIKE '%' || $2 || '%' OR cc ILIKE $1 OR regiao_pcs ILIKE $1`;
    }
    const count = await p.query(`SELECT count(*)::int AS c FROM funcionarios ${where}`, params);
    params.push(limit, offset);
    const rows = await p.query(`SELECT cpf, funcionario, cc, regiao_pcs, filial, situacao, cargo, banco, agencia, conta FROM funcionarios ${where} ORDER BY funcionario LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { rows: rows.rows.map(mapRow), total: count.rows[0]?.c ?? 0 };
}
