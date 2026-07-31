#!/usr/bin/env python3
"""
Investigate: Who has a VExpenses card vs who uses Itaú cards?

Approach:
1. Check quinzena_cadastro for status_cartao field — does it distinguish?
2. Check extrato_movimentacao — if someone has NO transactions at all, they likely don't have a VExpenses card
3. Cross-reference: users in API prestacao_reports but with ZERO extrato transactions
4. Check reference PAINEL — all users there should have VExpenses cards
5. Look at "CARTÃO CORPORATIVO ITAÚ" and similar patterns in report names
6. Check if the 20 "missing" users have any extrato transactions in our DB
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

def norm(s):
    return " ".join(str(s or "").upper().strip().split())

# ============================================================
# 1. Check status_cartao in quinzena_cadastro
# ============================================================
print("=" * 80)
print("1. status_cartao field in quinzena_cadastro")
print("=" * 80)

cur.execute("SELECT DISTINCT status_cartao FROM quinzena_cadastro")
status_values = [r["status_cartao"] for r in cur.fetchall()]
print(f"  Distinct values: {status_values}")

cur.execute("""
    SELECT status_cartao, COUNT(*) as cnt
    FROM quinzena_cadastro
    GROUP BY status_cartao
    ORDER BY cnt DESC
""")
for r in cur.fetchall():
    print(f"    {r['status_cartao']}: {r['cnt']}")

# ============================================================
# 2. Users in prestacao_reports (with CPF) but with ZERO extrato transactions
# ============================================================
print("\n" + "=" * 80)
print("2. Users with expense reports but NO extrato transactions (no VExpenses card?)")
print("=" * 80)

cur.execute("""
    SELECT DISTINCT r.user_name, r.user_cpf,
           COUNT(DISTINCT r.id) as report_count,
           SUM(COALESCE(re.total, 0)) as total_expenses
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    LEFT JOIN (
        SELECT report_id, SUM(value) as total
        FROM prestacao_expenses
        GROUP BY report_id
    ) re ON re.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
      AND TRIM(r.name) !~* '^(fatu|farur|cart)'
      AND TRIM(r.name) !~* '(fatura|fatuar|fatut|farur)'
    GROUP BY r.user_name, r.user_cpf
    ORDER BY r.user_name
""")
users_with_reports = cur.fetchall()

# Get all users that appear in extrato_movimentacao
cur.execute("""
    SELECT DISTINCT UPPER(usuario) as usuario_up
    FROM extrato_movimentacao
    WHERE is_snapshot = FALSE
""")
ext_users = set(r["usuario_up"] for r in cur.fetchall())

print(f"  Total users with expense reports: {len(users_with_reports)}")
print(f"  Total users with extrato transactions: {len(ext_users)}")

no_ext_users = []
for u in users_with_reports:
    user_up = norm(u["user_name"])
    # Check if this user appears in extrato (try exact and partial match)
    found = any(user_up in ext_u or ext_u in user_up for ext_u in ext_users)
    if not found:
        no_ext_users.append(u)

print(f"\n  Users with reports but NO extrato transactions: {len(no_ext_users)}")
for u in no_ext_users:
    print(f"    {u['user_name'][:35]:<35}  CPF={u['user_cpf']}  reports={u['report_count']}  R$ {float(u['total_expenses']):>10,.2f}")

# ============================================================
# 3. Check: are these no-extrato users in the reference PAINEL?
# ============================================================
print("\n" + "=" * 80)
print("3. Are no-extrato users in the reference PAINEL?")
print("=" * 80)

wb = openpyxl.load_workbook(REF_PATH, read_only=True, data_only=True)
ws_p = wb["PAINEL"]
painel_users = set()
painel_cpfs = set()
for row in ws_p.iter_rows(min_row=12, values_only=True):
    if row[2] is None and row[3] is None:
        continue
    cpf = str(row[2] or "").strip()
    colaborador = str(row[3] or "").strip()
    painel_users.add(norm(colaborador))
    painel_cpfs.add(cpf)

for u in no_ext_users:
    user_norm = norm(u["user_name"])
    in_painel = any(user_norm in p or p in user_norm for p in painel_users)
    in_painel_cpf = u["user_cpf"] in painel_cpfs
    print(f"  {u['user_name'][:35]:<35}  CPF={u['user_cpf']}  in_painel_by_name={in_painel}  in_painel_by_cpf={in_painel_cpf}")

# ============================================================
# 4. Check: ALL users in reference PAINEL — do they all have extrato transactions?
# ============================================================
print("\n" + "=" * 80)
print("4. Reference PAINEL users — do they ALL have extrato transactions?")
print("=" * 80)

painel_no_ext = []
for p_user in sorted(painel_users):
    if not p_user:
        continue
    found = any(p_user in ext_u or ext_u in p_user for ext_u in ext_users)
    if not found:
        painel_no_ext.append(p_user)

print(f"  PAINEL users: {len(painel_users)}")
print(f"  PAINEL users with NO extrato: {len(painel_no_ext)}")
for u in painel_no_ext:
    print(f"    {u}")

# ============================================================
# 5. Check: report names containing "ITAU" or "ITAÚ" or "CARTÃO CORPORATIVO"
# ============================================================
print("\n" + "=" * 80)
print("5. Report names with ITAU/CARTÃO CORPORATIVO patterns")
print("=" * 80)

cur.execute("""
    SELECT r.id, r.name, r.status, r.user_name, r.user_cpf,
           COUNT(e.id) as expense_count, SUM(e.value) as total_value
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
      AND (TRIM(r.name) ILIKE '%itau%' OR TRIM(r.name) ILIKE '%itaú%' 
           OR TRIM(r.name) ILIKE '%cartão corporativo%' OR TRIM(r.name) ILIKE '%cartao corporativo%')
    GROUP BY r.id, r.name, r.status, r.user_name, r.user_cpf
    ORDER BY r.user_name, r.name
""")
itau_reports = cur.fetchall()
print(f"  Total ITAU/CARTÃO CORPORATIVO reports: {len(itau_reports)}")
for r in itau_reports:
    in_ref = int(r["id"]) in set()  # Will check below
    print(f"  {r['id']}  {str(r['name'])[:40]:<40}  {r['status']:<10}  {str(r['user_name'])[:25]:<25}  CPF={r['user_cpf']}  {r['expense_count']:>3} items  R$ {float(r['total_value']):>10,.2f}")

# ============================================================
# 6. Check: what other "non-VExpenses" patterns exist in report names?
# ============================================================
print("\n" + "=" * 80)
print("6. All distinct report name patterns (first word/token)")
print("=" * 80)

cur.execute("""
    SELECT TRIM(r.name) as name, r.status, r.user_name
    FROM prestacao_reports r
    JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
    ORDER BY r.name
""")
all_reports = cur.fetchall()

# Categorize by first token
categories = defaultdict(lambda: {"count": 0, "examples": []})
for r in all_reports:
    name = r["name"].strip().upper() if r["name"] else ""
    if name.startswith("FATU") or name.startswith("FARUR") or name.startswith("FARTUR"):
        cat = "FATURA (excluded)"
    elif "CARTÃO CORPORATIVO" in name or "CARTAO CORPORATIVO" in name:
        cat = "CARTÃO CORPORATIVO"
    elif "ITAU" in name or "ITAÚ" in name:
        cat = "ITAU (other)"
    elif name.startswith("CAIXA"):
        cat = "CAIXA"
    elif name.startswith("DOLAR") or name.startswith("DÓLAR"):
        cat = "DOLAR"
    elif "MATERIAL" in name:
        cat = "MATERIAL"
    else:
        cat = "OTHER"
    categories[cat]["count"] += 1
    if len(categories[cat]["examples"]) < 3:
        categories[cat]["examples"].append(r["name"])

for cat, info in sorted(categories.items(), key=lambda x: -x[1]["count"]):
    print(f"\n  {cat}: {info['count']} reports")
    for ex in info["examples"]:
        print(f"    e.g.: {ex}")

# ============================================================
# 7. Check: the 20 "missing" users — do they have extrato in our DB?
# ============================================================
print("\n" + "=" * 80)
print("7. The 20 'missing' users — extrato transactions in our DB")
print("=" * 80)

users_no_ref = [
    "AFONSO FIORELLO CARVALHO", "AILTON MENDES AGUILAR", "AMARAL RODRIGUES NUNES",
    "ANA LUIZA OLIVEIRA CAMELO", "ATILA SILVA DOS SANTOS", "DANIEL PORFIRIO DE SOUSA",
    "ERASMO PEREIRA MONTEIRO", "FLAVIO PEREIRA DE SOUZA", "FRANCISCO MICHAEL CASTRO FERNANDES",
    "JACKSON CAROLINO CARNEIRO", "LEONARDO GONCALVES RIBEIRO FILHO", "MARCELO BEZERRA",
    "NELSON MOURA RIBEIRO", "OSMAN DOS SANTOS MORAIS JUNIOR", "PATRICK FERNANDO GOULART ALVES",
    "PEDRO LUIS PIRES DOS SANTOS", "ROBERTO ALIAGA", "SANDRA CRISTINA ALVES MACHADO",
    "WAGNER FERNANDES DA SILVA", "WESLEY CARLOS AUGUSTO",
]

for user in users_no_ref:
    user_up = norm(user)
    # Check extrato
    found_ext = any(user_up in ext_u or ext_u in user_up for ext_u in ext_users)
    # Check if they have ITAU/CARTÃO CORPORATIVO reports
    has_itau = any(r["user_name"] and user_up in norm(r["user_name"]) for r in itau_reports)
    
    # Count their reports by type
    user_reports = [r for r in all_reports if r["user_name"] and user_up in norm(r["user_name"])]
    itau_count = sum(1 for r in user_reports if "ITAU" in (r["name"] or "").upper() or "CARTÃO CORPORATIVO" in (r["name"] or "").upper())
    
    print(f"  {user[:35]:<35}  extrato={'YES' if found_ext else 'NO ':<3}  itau_reports={itau_count}/{len(user_reports)}")

# ============================================================
# 8. Key question: How many users in reference PAINEL have ITAU reports?
# ============================================================
print("\n" + "=" * 80)
print("8. Users in reference PAINEL that have ITAU/CARTÃO CORPORATIVO reports in API")
print("=" * 80)

for r in itau_reports:
    user_norm = norm(r["user_name"])
    in_painel = any(user_norm in p or p in user_norm for p in painel_users)
    if in_painel:
        print(f"  IN PAINEL  {r['user_name'][:30]:<30}  {str(r['name'])[:40]:<40}  {r['status']:<10}  R$ {float(r['total_value']):>10,.2f}")

wb.close()
conn.close()
