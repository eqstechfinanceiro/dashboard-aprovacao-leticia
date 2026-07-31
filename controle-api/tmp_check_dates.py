#!/usr/bin/env python3
"""Check date range and cutoff in reference BASE PREST."""
import openpyxl
from collections import defaultdict
from datetime import datetime

REF_PATH = r"C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\CONTROLE - VEXPENSES - JULHO 2026.xlsx"
wb = openpyxl.load_workbook(REF_PATH, read_only=True, data_only=True)
ws = wb["BASE PREST "]

# Parse dates and find the range
dates = []
status_by_month = defaultdict(lambda: defaultdict(float))
for row in ws.iter_rows(min_row=4, values_only=True):
    if row[0] is None:
        continue
    date_str = str(row[3] or "")
    status = str(row[10] or "").strip()
    value = float(row[26] or 0)
    # Parse dd/mm/yyyy
    try:
        parts = date_str.split("/")
        if len(parts) == 3:
            d = datetime(int(parts[2]), int(parts[1]), int(parts[0]))
            dates.append(d)
            month_key = f"{parts[2]}-{parts[1]}"
            status_by_month[month_key][status] += value
    except:
        pass

dates.sort()
print(f"Date range: {dates[0].strftime('%d/%m/%Y')} to {dates[-1].strftime('%d/%m/%Y')}")
print(f"Total dates: {len(dates)}")
print(f"\nLast 20 dates:")
for d in dates[-20:]:
    print(f"  {d.strftime('%d/%m/%Y')}")

print(f"\nStatus by month (last 10 months):")
for mk in sorted(status_by_month.keys())[-10:]:
    for st, val in status_by_month[mk].items():
        print(f"  {mk}: {st} = R$ {val:,.2f}")

wb.close()
