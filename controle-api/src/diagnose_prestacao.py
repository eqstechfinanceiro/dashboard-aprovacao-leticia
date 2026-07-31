#!/usr/bin/env python3
"""Check prestacao_reports: how many APROVADO have updated_at after cutoff, and their total value."""
from datetime import date
from pathlib import Path
import openpyxl

BASE = Path(__file__).parent.parent

def nf(raw):
    try: return float(raw) if raw is not None else 0.0
    except: return 0.0

wb = openpyxl.load_workbook(BASE / "data" / "neon_dump.xlsx", read_only=True, data_only=True)
ws = wb["prestacao_reports"]

cutoff = date(2026, 6, 30)
approved_before = 0
approved_after = 0
approved_no_date = 0
total_before = 0
total_after = 0
total_no_date = 0

# Also check created_at
created_before = 0
created_after = 0
total_created_before = 0
total_created_after = 0

for row in ws.iter_rows(min_row=2, values_only=True):
    rid = row[0]
    name = str(row[1] or "").upper()
    status = str(row[2] or "").upper()
    total_value = nf(row[6]) if len(row) > 6 else 0
    created_at = row[7] if len(row) > 7 else None
    updated_at = row[8] if len(row) > 8 else None
    
    if status != "APROVADO":
        continue
    if name.startswith("FATURA") or name.startswith("CARTAO") or name.startswith("CARTÃO"):
        continue
    
    # Check updated_at
    udate = None
    if updated_at:
        if hasattr(updated_at, 'date'):
            udate = updated_at.date() if hasattr(updated_at, 'date') else updated_at
        elif isinstance(updated_at, str):
            try: udate = date.fromisoformat(updated_at[:10])
            except: pass
    
    if udate is None:
        approved_no_date += 1
        total_no_date += total_value
    elif udate <= cutoff:
        approved_before += 1
        total_before += total_value
    else:
        approved_after += 1
        total_after += total_value
    
    # Check created_at
    cdate = None
    if created_at:
        if hasattr(created_at, 'date'):
            cdate = created_at.date() if hasattr(created_at, 'date') else created_at
        elif isinstance(created_at, str):
            try: cdate = date.fromisoformat(created_at[:10])
            except: pass
    
    if cdate and cdate <= cutoff:
        created_before += 1
        total_created_before += total_value
    elif cdate:
        created_after += 1
        total_created_after += total_value

wb.close()

print(f"=== APROVADO reports (excl. FATURA/CARTAO) ===")
print(f"  updated_at <= cutoff: {approved_before} reports, total_value R$ {total_before:,.2f}")
print(f"  updated_at > cutoff:  {approved_after} reports, total_value R$ {total_after:,.2f}")
print(f"  updated_at is NULL:   {approved_no_date} reports, total_value R$ {total_no_date:,.2f}")
print(f"  TOTAL:                {approved_before + approved_after + approved_no_date} reports, total_value R$ {total_before + total_after + total_no_date:,.2f}")
print()
print(f"  created_at <= cutoff: {created_before} reports, total_value R$ {total_created_before:,.2f}")
print(f"  created_at > cutoff:  {created_after} reports, total_value R$ {total_created_after:,.2f}")
print()
print(f"Ref prestacao total: R$ 6,780,885.57")
print(f"Gap with updated_at filter: R$ {6780885.57 - total_before - total_no_date:,.2f}")
print(f"Gap with all APROVADO: R$ {6780885.57 - total_before - total_after - total_no_date:,.2f}")
