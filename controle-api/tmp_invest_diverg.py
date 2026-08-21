#!/usr/bin/env python3
"""Investigate prestacao divergences by comparing BASE PREST data."""
import openpyxl
import re
from collections import defaultdict

REF_PATH = r"C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\CONTROLE - VEXPENSES - JULHO 2026.xlsx"

# Load reference BASE PREST
wb = openpyxl.load_workbook(REF_PATH, read_only=True, data_only=True)
ws = wb["BASE PREST "]

# Build: CPF -> list of (expense_id, report_name, status, value)
ref_prest = defaultdict(list)
for row in ws.iter_rows(min_row=4, values_only=True):
    if row[0] is None:
        continue
    cpf = str(row[9] or "").strip().replace(".", "").replace("-", "").replace(" ", "").zfill(11) if row[9] else ""
    ref_prest[cpf].append({
        "id": row[0],
        "report_id": row[1],
        "report_name": str(row[2] or ""),
        "status": str(row[10] or "").strip(),
        "value": float(row[26] or 0),
        "colaborador": str(row[4] or ""),
    })
wb.close()

# Top divergent CPFs from previous comparison
divergent_cpfs = [
    ("26652452804", "JOSE CARLOS BATISTA"),
    ("07214272946", "PATRICK FERNANDO GOULART"),
    ("67094260334", "JACKSON CAROLINO CARNEIRO"),
    ("85648809620", "LEONARDO GONCALVES RIBEIRO"),
    ("04982917906", "AFONSO FIORELLO CARVALHO"),
]

for cpf, name in divergent_cpfs:
    items = ref_prest.get(cpf, [])
    total = sum(i["value"] for i in items)
    statuses = defaultdict(float)
    for i in items:
        statuses[i["status"]] += i["value"]
    print("\n{} {} - {} items, total R$ {:,.2f}".format(cpf, name, len(items), total))
    for st, val in sorted(statuses.items()):
        print("  {}: R$ {:,.2f}".format(st, val))
    # Show report names
    reports = defaultdict(float)
    for i in items:
        reports[i["report_name"]] += i["value"]
    print("  Reports:")
    for rn, val in sorted(reports.items(), key=lambda x: -abs(x[1]))[:10]:
        print("    {:<30} R$ {:,.2f}".format(rn[:30], val))
