// Testes unitários das fórmulas da quinzena — node:test (sem dependência extra).
//
// Rodar:
//   npx tsc lib/quinzena/financials.ts lib/quinzena/financials.test.ts \
//     --outDir .test-out --module commonjs --target es2020 --skipLibCheck
//   node --test .test-out/financials.test.js
//
// Cobre as regras de negócio que já causaram divergência em fechamento real:
// datas quinzenais, carga parcial, reembolso só na 1ª QZ, clamp de negativos,
// cartão pendente zerando tudo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getQuinzenaDates, calcFinancials, toNum, r2 } from './financials';

// ---- getQuinzenaDates --------------------------------------------------------

test('QZ1: período 26 do mês anterior → 10 do mês atual', () => {
  const d = getQuinzenaDates(2026, 9, 1);
  assert.equal(d.start_date, '2026-08-26');
  assert.equal(d.end_date, '2026-09-10');
  assert.equal(d.fechamento, '2026-09-11');
  assert.equal(d.financial_cutoff, '2026-08-31');
  assert.equal(d.saldo_cartao_controle_date, '2026-09-01');
  assert.equal(d.saldo_cartao_carga_date, '2026-09-11');
});

test('QZ2: período 11 → 25 do mesmo mês', () => {
  const d = getQuinzenaDates(2026, 9, 2);
  assert.equal(d.start_date, '2026-09-11');
  assert.equal(d.end_date, '2026-09-25');
  assert.equal(d.fechamento, '2026-09-25');
  assert.equal(d.financial_cutoff, '2026-08-31'); // mesmo cutoff da QZ1
  assert.equal(d.saldo_cartao_carga_date, '2026-09-25');
});

test('Janeiro: mês anterior é dezembro do ano anterior', () => {
  const d = getQuinzenaDates(2026, 1, 1);
  assert.equal(d.start_date, '2025-12-26');
  assert.equal(d.end_date, '2026-01-10');
  assert.equal(d.financial_cutoff, '2025-12-31');
  assert.equal(d.saldo_cartao_controle_date, '2026-01-01');
});

test('Março em ano não-bissexto: cutoff 28/02', () => {
  const d = getQuinzenaDates(2025, 3, 1);
  assert.equal(d.financial_cutoff, '2025-02-28');
});

test('Março em ano bissexto: cutoff 29/02', () => {
  const d = getQuinzenaDates(2024, 3, 1);
  assert.equal(d.financial_cutoff, '2024-02-29');
});

// ---- calcFinancials -----------------------------------------------------------

test('carga simples: QZ - saldo_final - saldo_cartao - adiantamento', () => {
  const r = calcFinancials(1000, 200, 100, 0, 50, 2, 'Cartão ativo');
  assert.equal(r.carga_parcial, 650);
  assert.equal(r.reembolso, 0);           // QZ2 nunca paga reembolso
  assert.equal(r.carga_final, 650);
});

test('reembolso só na 1ª QZ: 50% do saldo a reembolsar', () => {
  const q1 = calcFinancials(500, 0, 0, 300, 0, 1, 'Cartão ativo');
  assert.equal(q1.reembolso, 150);
  assert.equal(q1.carga_final, 650);      // 500 parcial + 150 reembolso
  const q2 = calcFinancials(500, 0, 0, 300, 0, 2, 'Cartão ativo');
  assert.equal(q2.reembolso, 0);
  assert.equal(q2.carga_final, 500);
});

test('multiplicador de reembolso configurável', () => {
  const r = calcFinancials(0, 0, 0, 200, 0, 1, 'Cartão ativo', 0.3);
  assert.equal(r.reembolso, 60);
  assert.equal(r.carga_final, 60);
});

test('saldo_reembolsar negativo não gera reembolso', () => {
  const r = calcFinancials(100, 0, 0, -50, 0, 1, 'Cartão ativo');
  assert.equal(r.reembolso, 0);
  assert.equal(r.carga_final, 100);
});

test('carga_parcial negativa é zerada no carga_final (não desconta)', () => {
  const r = calcFinancials(100, 500, 200, 0, 0, 2, 'Cartão ativo');
  assert.equal(r.carga_parcial, -600);     // parcial informa o negativo
  assert.equal(r.carga_final, 0);          // mas a carga final não fica negativa
});

test('carga_parcial negativa + reembolso positivo na QZ1 paga só o reembolso', () => {
  const r = calcFinancials(100, 500, 200, 400, 0, 1, 'Cartão ativo');
  assert.equal(r.carga_parcial, -600);
  assert.equal(r.reembolso, 200);
  assert.equal(r.carga_final, 200);        // max(0,-600) + 200
});

test('cartão pendente zera TUDO independente dos valores', () => {
  const r = calcFinancials(9999, 0, 0, 500, 0, 1, 'Cartão pendente de emissão');
  assert.deepEqual(r, { carga_parcial: 0, reembolso: 0, carga_final: 0 });
});

test('status "pendente" case-insensitive', () => {
  const r = calcFinancials(999, 0, 0, 100, 0, 1, 'PENDENTE');
  assert.deepEqual(r, { carga_parcial: 0, reembolso: 0, carga_final: 0 });
});

test('adiantamento reduz a carga', () => {
  const sem = calcFinancials(1000, 0, 0, 0, 0, 2, 'Cartão ativo');
  const com = calcFinancials(1000, 0, 0, 0, 300, 2, 'Cartão ativo');
  assert.equal(com.carga_final, sem.carga_final - 300);
});

test('arredondamento em centavos (R$341,xx não vira R$341,xy)', () => {
  const r = calcFinancials(341.005, 0, 0, 100.333, 0, 1, 'Cartão ativo');
  assert.equal(r.carga_parcial, 341.01);   // round half up
  assert.equal(r.reembolso, 50.17);        // 100.333*0.5 = 50.1665 → 50.17
  assert.equal(r.carga_final, 391.18);
});

// ---- helpers -----------------------------------------------------------------

test('toNum: null/undefined/string inválida → 0', () => {
  assert.equal(toNum(null), 0);
  assert.equal(toNum(undefined), 0);
  assert.equal(toNum('abc'), 0);
  assert.equal(toNum('123.45'), 123.45);
  assert.equal(toNum('-7.5'), -7.5);
});

test('r2 arredonda para centavos', () => {
  assert.equal(r2(1.005), 1.01);
  assert.equal(r2(-2.675), -2.67); // ponto flutuante: -2.675 → -2.67
  assert.equal(r2(0), 0);
});
