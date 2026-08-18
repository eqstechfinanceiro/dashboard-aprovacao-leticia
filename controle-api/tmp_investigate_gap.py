"""Investigate the R$ 90k gap: what's in API but not in reference, and vice versa."""
import os, psycopg2, psycopg2.extras, openpyxl
from dotenv import load_dotenv
from pathlib import Path
from collections import defaultdict

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Load reference
REF_PATH = r"C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\CONTROLE - VEXPENSES - JULHO 2026.xlsx"
wb = openpyxl.load_workbook(REF_PATH, read_only=True, data_only=True)
ws_bp = wb["BASE PREST "]
ws_p = wb["PAINEL"]

vexpenses_cpfs = set()
for row in ws_p.iter_rows(min_row=12, values_only=True):
    if row[2] is None:
        continue
    cpf = str(row[2] or "").strip()
    cartao_vx = str(row[12] or "").strip().upper() if len(row) > 12 else ""
    if cartao_vx == "SIM":
        vexpenses_cpfs.add(cpf)

ref_expense_ids = set()
ref_by_cpf = defaultdict(float)
for row in ws_bp.iter_rows(min_row=4, values_only=True):
    if row[0] is None:
        continue
    eid = int(row[0])
    cpf = str(row[9] or "").strip() if len(row) > 9 else ""
    valor = float(row[26] or 0) if len(row) > 26 else 0.0
    ref_expense_ids.add(eid)
    ref_by_cpf[cpf] += valor
wb.close()

# Load API with same filter as export_gap_analysis
def is_card_report(name):
    n = name.strip().upper()
    if not n:
        return False
    if 'CAIXA ITAU' in n or 'CAIXA ITAÚ' in n:
        return True
    if n.startswith('CAIXA'):
        return False
    if n.startswith(('FATURA', 'CARTAO', 'CARTÃO', 'FATUAR', 'FARTUR', 'FATUT', 'FARUR', 'FATUTR')):
        return True
    if 'CARTÃO DE CRÉDITO' in n or 'CARTAO DE CREDITO' in n or 'CARTÃO DE CREDITO' in n:
        return True
    if 'CARTÃO CORPORATIVO' in n:
        return True
    if ('ITAU' in n or 'ITAÚ' in n) and 'CAIXA' not in n:
        return True
    if 'DOLAR' in n or 'DÓLAR' in n:
        return True
    if n.startswith('DESPESA') and 'FATURA' in n:
        return True
    if n.startswith('COMPLEMENTAR') and 'FATURA' in n:
        return True
    if 'CARTÃO' in n and 'CRÉDITO' in n:
        return True
    if 'CARTAO' in n and 'CREDITO' in n:
        return True
    if n.startswith('CARTÃO VEXPENSES'):
        return True
    return False

cur.execute("""
    SELECT e.id, e.report_id, e.value, e.description, e.date,
           r.name as report_name, r.user_cpf, r.user_name,
           e.raw_data->>'payment_method_id' as pm_id,
           e.raw_data->>'payment_method_name' as pm_name
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
    ORDER BY e.value DESC
""")
all_api = cur.fetchall()
conn.close()

# Apply same filter
filtered = [e for e in all_api if not is_card_report(e["report_name"] or "") and e["user_cpf"] in vexpenses_cpfs]

api_expense_ids = set(e["id"] for e in filtered)
api_by_cpf = defaultdict(float)
for e in filtered:
    api_by_cpf[e["user_cpf"]] += float(e["value"])

# New expenses (in API, not in ref)
new_expenses = [e for e in filtered if e["id"] not in ref_expense_ids]
missing_expenses = api_expense_ids - ref_expense_ids  # same thing

print(f"API filtered: {len(filtered)} expenses, R$ {sum(float(e['value']) for e in filtered):,.2f}")
print(f"Reference: {len(ref_expense_ids)} expenses, R$ {sum(ref_by_cpf.values()):,.2f}")
print(f"New expenses (API only): {len(new_expenses)} totaling R$ {sum(float(e['value']) for e in new_expenses):,.2f}")
print(f"Missing expenses (Ref only): {len(ref_expense_ids - api_expense_ids)}")

print(f"\n--- New expenses by pm_id ---")
from collections import Counter
pm_counts = Counter()
pm_totals = defaultdict(float)
for e in new_expenses:
    pm = e.get("pm_id") or "NULL"
    pm_counts[pm] += 1
    pm_totals[pm] += float(e["value"])
for pm, cnt in pm_counts.most_common():
    print(f"  pm_id={pm:>10s}  count={cnt:>5d}  total=R$ {pm_totals[pm]:>12,.2f}")

print(f"\n--- Top 20 new expenses (API only, not in ref) ---")
for e in new_expenses[:20]:
    desc = (e['description'] or '')[:40]
    rname = (e['report_name'] or '')[:30]
    uname = (e['user_name'] or '')[:25]
    print(f"  id={e['id']} | R$ {float(e['value']):>10,.2f} | pm={e.get('pm_id') or 'NULL':>8s} | {rname:30s} | {uname:25s} | {desc}")

# Check: are any of these new expenses from reports that ARE in the reference?
ref_report_ids = set()
# Reload to get report ids
wb2 = openpyxl.load_workbook(REF_PATH, read_only=True, data_only=True)
ws_bp2 = wb2["BASE PREST "]
for row in ws_bp2.iter_rows(min_row=4, values_only=True):
    if row[0] is None:
        continue
    rid = int(row[1]) if row[1] else None
    if rid:
        ref_report_ids.add(rid)
wb2.close()

new_in_existing_reports = [e for e in new_expenses if e["report_id"] in ref_report_ids]
new_in_new_reports = [e for e in new_expenses if e["report_id"] not in ref_report_ids]
print(f"\n  New expenses in EXISTING ref reports: {len(new_in_existing_reports)} totaling R$ {sum(float(e['value']) for e in new_in_existing_reports):,.2f}")
print(f"  New expenses in NEW reports (not in ref): {len(new_in_new_reports)} totaling R$ {sum(float(e['value']) for e in new_in_new_reports):,.2f}")

print(f"\n--- Per-CPF gap (top 15) ---")
all_cpfs = set(api_by_cpf.keys()) | set(ref_by_cpf.keys())
gaps = []
for cpf in all_cpfs:
    gap = api_by_cpf.get(cpf, 0) - ref_by_cpf.get(cpf, 0)
    if abs(gap) > 0.01:
        gaps.append((cpf, gap, api_by_cpf.get(cpf, 0), ref_by_cpf.get(cpf, 0)))
gaps.sort(key=lambda x: abs(x[1]), reverse=True)
for cpf, gap, api_v, ref_v in gaps[:15]:
    print(f"  cpf={cpf:>14s}  gap=R$ {gap:>10,.2f}  api=R$ {api_v:>10,.2f}  ref=R$ {ref_v:>10,.2f}")
