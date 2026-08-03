"""Check when the reference BASE PREST was exported and summarize gap report timing."""
import os, json, psycopg2, psycopg2.extras, openpyxl
from dotenv import load_dotenv
from pathlib import Path
from collections import Counter

load_dotenv(Path(__file__).parent / ".env")

REF_PATH = r"C:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\CONTROLE - VEXPENSES - JULHO 2026.xlsx"

# Check reference file modification time
import datetime
ref_stat = os.stat(REF_PATH)
ref_mtime = datetime.datetime.fromtimestamp(ref_stat.st_mtime)
print(f"Reference file last modified: {ref_mtime}")

# Check the latest approval_date in the reference data
wb = openpyxl.load_workbook(REF_PATH, read_only=True, data_only=True)
ws_bp = wb["BASE PREST "]

# Find the approval date column - check headers
headers = []
for row in ws_bp.iter_rows(min_row=1, max_row=3, values_only=True):
    headers.append(row)
print(f"\nHeaders row 1-3 (first 15 cols):")
for i, h in enumerate(headers):
    vals = [str(v)[:25] if v else "" for v in h[:15]]
    print(f"  Row {i+1}: {vals}")

# Check if there's an approval date column
# BASE PREST typically has: expense_id, report_id, report_name, ..., approval_date
# Let's find it
approval_col = None
for ci, val in enumerate(headers[2] if len(headers) > 2 else headers[0]):
    if val and "aprov" in str(val).lower():
        approval_col = ci
        print(f"\nApproval date column found at index {ci}: {val}")
        break

if approval_col is None:
    # Try row 2
    for ci, val in enumerate(headers[1] if len(headers) > 1 else []):
        if val and "aprov" in str(val).lower():
            approval_col = ci
            print(f"\nApproval date column found at index {ci} (row 2): {val}")
            break

# Get latest approval dates from reference
ref_dates = []
for row in ws_bp.iter_rows(min_row=4, values_only=True):
    if row[0] is None:
        continue
    # Try to find date columns
    for ci, val in enumerate(row):
        if val and isinstance(val, (datetime.datetime, datetime.date)):
            ref_dates.append((ci, val))

if ref_dates:
    # Find the latest date
    latest = max(ref_dates, key=lambda x: x[1])
    print(f"\nLatest date in reference: col {latest[0]} = {latest[1]}")
    
    # Count dates by day
    date_counts = Counter()
    for ci, d in ref_dates:
        if isinstance(d, datetime.datetime):
            date_counts[d.date()] += 1
        elif isinstance(d, datetime.date):
            date_counts[d] += 1
    
    print(f"\nTop 10 most common dates in reference:")
    for d, cnt in date_counts.most_common(10):
        print(f"  {d}: {cnt} cells")

wb.close()

# Now check the gap reports from DB
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

gap_report_ids = [
    10372756, 9823077, 9823071, 9366952, 11081495, 11080905, 11081343,
    11081001, 11080309, 11080145, 11080573, 10920785, 11080690, 11081446,
    10977210, 10917583, 10938615, 10984423,
    9695987, 10918481, 10874586, 10658622, 10793680, 10793693, 10639294,
    10794955, 10597789, 10664463, 10581502, 9792680, 9830796, 9759226,
    10912883, 10470546, 10338583, 10613695, 10816580, 10583924,
]

cur.execute("""
    SELECT id, name, status, user_name, created_at, updated_at, raw_data
    FROM prestacao_reports
    WHERE id = ANY(%s)
    ORDER BY id
""", (gap_report_ids,))

reports = cur.fetchall()
conn.close()

print(f"\n{'='*120}")
print(f"Gap reports - approval timeline analysis")
print(f"{'='*120}")
print(f"{'Report ID':>10s} | {'Status':>10s} | {'Approval Date':>20s} | {'Updated At':>20s} | {'Created At':>20s} | {'Name':25s} | {'User':25s}")
print("-" * 140)

categories = {
    "approved_after_ref": [],
    "sent_after_ref": [],
    "no_approval_date": [],
    "approved_before_ref": [],
}

for r in reports:
    raw = r["raw_data"] or {}
    if isinstance(raw, str):
        raw = json.loads(raw)
    
    approval_date = raw.get("approval_date", "") if raw else ""
    updated_at = raw.get("updated_at", "") if raw else ""
    
    created_str = str(r["created_at"])[:19] if r["created_at"] else ""
    updated_str = str(r["updated_at"])[:19] if r["updated_at"] else ""
    approval_str = str(approval_date)[:19] if approval_date else ""
    
    print(f"{r['id']:>10d} | {r['status'] or '':>10s} | {approval_str:>20s} | {updated_str:>20s} | {created_str:>20s} | {(r['name'] or '')[:25]:25s} | {(r['user_name'] or '')[:25]:25s}")
    
    if not approval_date:
        categories["no_approval_date"].append(r["id"])
    elif "2026-07" in str(approval_date):
        if r["status"] and r["status"].upper() == "APROVADO":
            categories["approved_after_ref"].append(r["id"])
        else:
            categories["sent_after_ref"].append(r["id"])
    else:
        categories["approved_before_ref"].append(r["id"])

print(f"\n{'='*60}")
print(f"Summary:")
print(f"  Approved in July 2026 (after ref export): {len(categories['approved_after_ref'])} reports")
print(f"  Sent in July 2026 (after ref export):     {len(categories['sent_after_ref'])} reports")
print(f"  No approval date:                          {len(categories['no_approval_date'])} reports")
print(f"  Approved before July:                      {len(categories['approved_before_ref'])} reports")
print(f"\n  Total gap reports: {len(reports)}")
