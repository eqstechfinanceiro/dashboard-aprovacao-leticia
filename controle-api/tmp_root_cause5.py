#!/usr/bin/env python3
"""
Final root cause analysis:
1. Check created_at for the 54 pre-cutoff new reports
2. Check TARIFA dedup issue — find the exact missing transactions
3. Check "Fartura" typo — it's NOT being excluded but IS excluded from reference
"""
import os, re
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path
import openpyxl
from collections import defaultdict

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")
NEON_URL = os.getenv("NEON_DATABASE_URL")

REF_PATH = r"C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\CONTROLE - VEXPENSES - JULHO 2026.xlsx"

conn = psycopg2.connect(NEON_URL, connect_timeout=10)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# ============================================================
# PART 1: Check created_at for 54 pre-cutoff new reports
# ============================================================
print("=" * 80)
print("PART 1: created_at for pre-cutoff new reports")
print("=" * 80)

wb = openpyxl.load_workbook(REF_PATH, read_only=True, data_only=True)
ws_bp = wb["BASE PREST "]
ref_report_ids = set()
for row in ws_bp.iter_rows(min_row=4, values_only=True):
    if row[0] is not None and row[1] is not None:
        ref_report_ids.add(int(row[1]))
wb.close()

cur.execute("""
    SELECT r.id, r.name, r.status, r.user_name, r.created_at, r.updated_at,
           MIN(e.date) as min_exp_date, MAX(e.date) as max_exp_date,
           COUNT(e.id) as expense_count, SUM(e.value) as total_value
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
      AND TRIM(r.name) !~* '^(fatu|farur|cart)'
      AND TRIM(r.name) !~* '(fatura|fatuar|fatut|farur)'
    GROUP BY r.id, r.name, r.status, r.user_name, r.created_at, r.updated_at
""")
all_api_reports = cur.fetchall()
new_reports = [r for r in all_api_reports if int(r["id"]) not in ref_report_ids]
pre_cutoff = [r for r in new_reports if r["max_exp_date"] and str(r["max_exp_date"]) <= "2026-06-30"]

print(f"Pre-cutoff new reports ({len(pre_cutoff)}):")
for r in sorted(pre_cutoff, key=lambda x: str(x["created_at"] or "9999")):
    print(f"  {r['id']}  {str(r['name'])[:30]:<30}  {r['status']:<10}  created={str(r['created_at'])[:10]}  updated={str(r['updated_at'])[:10]}  expenses={r['expense_count']:>3}  R$ {float(r['total_value']):>10,.2f}  exp_dates={r['min_exp_date']} to {r['max_exp_date']}")

# ============================================================
# PART 2: TARIFA dedup — find exact missing transactions
# ============================================================
print("\n" + "=" * 80)
print("PART 2: TARIFA dedup — find missing ABNER transactions")
print("=" * 80)

# Get ALL Taxa transactions for ABNER (no dedup)
cur.execute("""
    SELECT data, hora, valor, descricao, codigo_transacao
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
      AND tipo = 'Taxa'
      AND UPPER(usuario) = 'ABNER ANDRADE CAVALCANTE'
      AND data <= '2026-06-30'
    ORDER BY data, hora
""")
all_abner = cur.fetchall()
print(f"All ABNER Taxa in DB (no dedup): {len(all_abner)} rows, total R$ {sum(abs(float(r['valor'])) for r in all_abner):.2f}")

# Check for true duplicates (same data, hora, valor)
seen = set()
dups = []
for r in all_abner:
    key = (r["data"], str(r["hora"]), float(r["valor"]))
    if key in seen:
        dups.append(r)
    seen.add(key)
print(f"True duplicates (same data+hora+valor): {len(dups)}")
for d in dups:
    print(f"  {d['data']} {d['hora']} R$ {float(d['valor']):.2f} {d['descricao']}")

# Now apply our dedup logic and compare
cur.execute("""
    WITH deduped AS (
        SELECT DISTINCT ON (
            UPPER(usuario), data, tipo, valor,
            COALESCE(NULLIF(codigo_transacao, ''), hora::text)
        )
            data, hora, valor, descricao, codigo_transacao
        FROM extrato_movimentacao
        WHERE is_snapshot = FALSE
          AND tipo = 'Taxa'
          AND UPPER(usuario) = 'ABNER ANDRADE CAVALCANTE'
          AND data <= '2026-06-30'
        ORDER BY UPPER(usuario), data, tipo, valor,
            COALESCE(NULLIF(codigo_transacao, ''), hora::text)
    )
    SELECT data, hora, valor, descricao, codigo_transacao
    FROM deduped
    ORDER BY data, hora
""")
deduped_abner = cur.fetchall()
print(f"\nDeduped ABNER Taxa: {len(deduped_abner)} rows, total R$ {sum(abs(float(r['valor'])) for r in deduped_abner):.2f}")

# Find which rows were removed by dedup
deduped_keys = set((r["data"], str(r["hora"]), float(r["valor"])) for r in deduped_abner)
removed = [r for r in all_abner if (r["data"], str(r["hora"]), float(r["valor"])) not in deduped_keys]
print(f"Removed by dedup: {len(removed)}")
for r in removed:
    print(f"  {r['data']} {r['hora']} R$ {float(r['valor']):.2f} {r['descricao']}  cod={r['codigo_transacao']}")

# ============================================================
# PART 3: "Fartura" — check if it should be excluded
# ============================================================
print("\n" + "=" * 80)
print("PART 3: 'Fartura' exclusion check")
print("=" * 80)

# Report 10383163 "Fartura 05/2026" — is it in reference BASE PREST?
# Already confirmed NOT in ref. Check if it's a FATURA variant
name = "Fartura 05/2026"
print(f"Report name: '{name}'")
print(f"  Matches '^(fatu|farur|cart)': {bool(re.match(r'^(fatu|farur|cart)', name, re.IGNORECASE))}")
print(f"  Matches '(fatura|fatuar|fatut|farur)': {bool(re.search(r'(fatura|fatuar|fatut|farur)', name, re.IGNORECASE))}")
print(f"  Matches 'fartur': {bool(re.search(r'fartur', name, re.IGNORECASE))}")
print(f"  Should be excluded as FATURA typo: YES (Fartura = FATURA typo)")

# Check if there are other "Fartura" reports
cur.execute("""
    SELECT id, name, status, user_name
    FROM prestacao_reports
    WHERE TRIM(name) ILIKE 'fartur%'
""")
fartura_reports = cur.fetchall()
print(f"\nAll 'Fartur%' reports:")
for r in fartura_reports:
    matches = bool(re.match(r'^(fatu|farur|cart)', r["name"].strip(), re.IGNORECASE) or re.search(r'(fatura|fatuar|fatut|farur)', r["name"].strip(), re.IGNORECASE))
    print(f"  {r['id']}  {r['name']:<35}  {r['status']:<10}  {r['user_name'][:25]}  excluded_by_current_regex={matches}")

# ============================================================
# PART 4: Summary of total API reports vs reference
# ============================================================
print("\n" + "=" * 80)
print("PART 4: Report count comparison")
print("=" * 80)

cur.execute("""
    SELECT COUNT(DISTINCT r.id) as total_reports,
           COUNT(DISTINCT r.id) FILTER (WHERE r.status ILIKE 'Aprovado') as aprovado,
           COUNT(DISTINCT r.id) FILTER (WHERE r.status ILIKE 'Enviado') as enviado,
           COUNT(DISTINCT e.id) as total_expenses,
           SUM(e.value) as total_value
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.user_cpf IS NOT NULL
      AND TRIM(r.name) !~* '^(fatu|farur|cart)'
      AND TRIM(r.name) !~* '(fatura|fatuar|fatut|farur)'
""")
r = cur.fetchone()
print(f"API (after FATURA exclusion):")
print(f"  Reports: {r['total_reports']} (Aprovado={r['aprovado']}, Enviado={r['enviado']})")
print(f"  Expenses: {r['total_expenses']}")
print(f"  Total value: R$ {float(r['total_value']):,.2f}")

print(f"\nReference BASE PREST:")
print(f"  Reports: 4437")
print(f"  Expenses: 71748 (Aprovado=69120, Enviado=2628)")

# Check how many API reports are APROVADO+ENVIADO only
cur.execute("""
    SELECT COUNT(DISTINCT r.id) as total,
           COUNT(DISTINCT r.id) FILTER (WHERE r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado') as aprov_enviado
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.user_cpf IS NOT NULL
      AND TRIM(r.name) !~* '^(fatu|farur|cart)'
      AND TRIM(r.name) !~* '(fatura|fatuar|fatut|farur)'
""")
r = cur.fetchone()
print(f"\nAPI reports with expenses (after exclusion): {r['total']} total, {r['aprov_enviado']} Aprovado+Enviado")

conn.close()
