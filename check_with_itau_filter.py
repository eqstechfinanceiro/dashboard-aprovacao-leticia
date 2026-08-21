import psycopg2
import json
from collections import defaultdict

DB_URL = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"
conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# ITAU payment_method_id = 627401
# Calculate per-CPF totals excluding Itau expenses
cur.execute("""
    SELECT r.user_cpf,
           r.user_name,
           COALESCE(SUM(e.value), 0) as total_prestacao,
           COUNT(e.id) as expense_count,
           COUNT(DISTINCT r.id) as report_count
    FROM prestacao_reports r
    LEFT JOIN prestacao_expenses e ON e.report_id = r.id
    WHERE r.user_cpf IS NOT NULL
      AND (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND NOT (r.name ILIKE '%FATURA%' OR r.name ILIKE '%CARTAO%' OR r.name ILIKE '%CARTAO%')
      AND (e.raw_data->>'payment_method_id' IS NULL OR e.raw_data->>'payment_method_id' != '627401')
    GROUP BY r.user_cpf, r.user_name
    ORDER BY r.user_name
""")
cpf_data = {}
for row in cur.fetchall():
    cpf = str(row[0]).strip()
    cpf_data[cpf] = {
        "nome": row[1],
        "total": float(row[2]),
        "expense_count": int(row[3]),
        "report_count": int(row[4]),
    }

print(f"CPFs with data (excluding Itau): {len(cpf_data)}")

# Total
total_db = sum(d["total"] for d in cpf_data.values())
print(f"Total DB (excluding Itau): R$ {total_db:,.2f}")

# Compare with PAINEL
import openpyxl
wb = openpyxl.load_workbook(
    r"c:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\CONTROLE - VEXPENSES - AGOSTO 2026.xlsx",
    read_only=True, data_only=True
)
ws = wb['PAINEL']
painel = {}
for row in ws.iter_rows(min_row=12, values_only=True):
    cpf = str(row[2]).strip() if len(row) > 2 and row[2] else ''
    if not cpf or cpf == 'None':
        continue
    painel[cpf] = {
        "nome": str(row[1]).strip() if row[1] else '',
        "prestacao": float(row[16]) if row[16] is not None else 0,
    }
wb.close()

total_painel = sum(p["prestacao"] for p in painel.values())
print(f"Total PAINEL: R$ {total_painel:,.2f}")
print(f"Diff: R$ {total_db - total_painel:+,.2f}")

# Per-CPF diffs
all_cpfs = set(cpf_data.keys()) | set(painel.keys())
abs_diff = 0
exact_match = 0
diffs = []
for cpf in all_cpfs:
    db_val = cpf_data.get(cpf, {}).get("total", 0)
    pn_val = painel.get(cpf, {}).get("prestacao", 0)
    d = db_val - pn_val
    if abs(d) > 0.01:
        diffs.append((cpf, cpf_data.get(cpf, {}).get("nome", painel.get(cpf, {}).get("nome", "")), db_val, pn_val, d))
        abs_diff += abs(d)
    else:
        exact_match += 1

diffs.sort(key=lambda x: abs(x[4]), reverse=True)
print(f"\nExact matches: {exact_match}/{len(all_cpfs)}")
print(f"Sum of absolute diffs: R$ {abs_diff:,.2f}")
print(f"\nTop 20 diffs:")
for cpf, nome, db, pn, d in diffs[:20]:
    print(f"  {nome[:30]:30s} cpf={cpf} DB={db:>12,.2f} PAINEL={pn:>12,.2f} diff={d:>+10,.2f}")

# Now check AFONSO specifically
afonso = cpf_data.get('04982917906', {})
print(f"\nAFONSO (04982917906): DB={afonso.get('total', 0):,.2f} (was 5895.32 with Itau)")
print(f"  PAINEL={painel.get('04982917906', {}).get('prestacao', 0):,.2f}")

cur.close()
conn.close()
