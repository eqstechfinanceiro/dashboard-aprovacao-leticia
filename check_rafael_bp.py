import openpyxl
from collections import defaultdict

wb = openpyxl.load_workbook('CONTROLE - VEXPENSES - AGOSTO 2026.xlsx', read_only=True, data_only=True)
ws = wb['BASE PREST ']

rafael_reports = defaultdict(lambda: {'total': 0, 'count': 0, 'status': '', 'name': ''})
for row in ws.iter_rows(min_row=4, values_only=True):
    cpf = str(row[9]).strip() if row[9] else ''
    if cpf != '01677920599':
        continue
    report_id = str(row[1]).strip() if row[1] else ''
    valor = float(row[26]) if row[26] is not None else 0
    status = str(row[10]).strip() if row[10] else ''
    name = str(row[2]).strip() if row[2] else ''
    rafael_reports[report_id]['total'] += valor
    rafael_reports[report_id]['count'] += 1
    rafael_reports[report_id]['status'] = status
    rafael_reports[report_id]['name'] = name

total_sum = sum(r['total'] for r in rafael_reports.values())
print(f'BASE PREST for RAFAEL: {len(rafael_reports)} reports, total={total_sum:.2f}')
for rid, info in sorted(rafael_reports.items(), key=lambda x: x[1]['total'], reverse=True):
    print(f'  ID={rid} name={info["name"]} status={info["status"]} count={info["count"]} total={info["total"]:.2f}')
