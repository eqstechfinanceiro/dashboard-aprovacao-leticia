import requests
import time
import openpyxl
from collections import defaultdict

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
ITAU_PMID = "627401"
OUTPUT = r"c:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\BASE_PREST_API_FRESH_V2.xlsx"
api_headers = {"Authorization": API_KEY, "Accept": "application/json"}

# Step 1: Load Excel report IDs
print("[1/4] Loading Excel...", flush=True)
wb = openpyxl.load_workbook(OUTPUT, read_only=True)
ws = wb["BASE PREST (API)"]
excel_rids = set()
for row in ws.iter_rows(min_row=2, max_col=1, values_only=True):
    if row[0]:
        excel_rids.add(row[0])
wb.close()
print(f"  {len(excel_rids)} reports in Excel", flush=True)

# Step 2: Fetch all reports, find candidates likely to have ITAU expenses
print("[2/4] Fetching all reports...", flush=True)
resp = requests.get(f"{API_URL}/v2/reports?include=user", headers=api_headers, timeout=120)
all_reports = resp.json().get("data", [])
print(f"  {len(all_reports)} reports", flush=True)

candidates = []
for r in all_reports:
    rid = r["id"]
    if rid not in excel_rids:
        continue
    desc = (r.get("description") or "").upper()
    rpmid = str(r.get("payment_method_id", ""))
    # Candidate if description mentions ITAU or report payment method is ITAU
    if "ITAU" in desc or rpmid == ITAU_PMID:
        candidates.append(r)

print(f"  Candidates (in Excel + ITAU-related): {len(candidates)}", flush=True)

# Also add all reports that have "itau" in description even if not caught above
# (broader search)
extra = []
for r in all_reports:
    rid = r["id"]
    if rid not in excel_rids:
        continue
    if r in candidates:
        continue
    desc = (r.get("description") or "").upper()
    if "ITAU" in desc or "CARTAO" in desc or "CARTÃO" in desc:
        extra.append(r)
        candidates.append(r)
if extra:
    print(f"  Added {len(extra)} more by description (CARTAO/CARTÃO)", flush=True)

# Step 3: Fetch each candidate and count ITAU vs non-ITAU expenses
print(f"[3/4] Fetching {len(candidates)} candidate reports...", flush=True)
mixed = []
only_itau = []
total_itau_excluded = 0

for i, r in enumerate(candidates):
    rid = r["id"]
    for attempt in range(3):
        try:
            resp = requests.get(
                f"{API_URL}/v2/reports/{rid}?include=expenses",
                headers=api_headers,
                timeout=30
            )
            if resp.status_code == 429:
                time.sleep(10)
                continue
            if resp.status_code == 404:
                break
            resp.raise_for_status()
            data = resp.json()
            expenses = data.get("data", {}).get("expenses", {}).get("data", [])
            itau = sum(1 for e in expenses if str(e.get("payment_method_id", "")) == ITAU_PMID)
            non_itau = len(expenses) - itau
            if itau > 0 and non_itau > 0:
                mixed.append((rid, r.get("description", ""), itau, non_itau))
                total_itau_excluded += itau
            elif itau > 0 and non_itau == 0:
                only_itau.append((rid, r.get("description", ""), itau))
            break
        except Exception as e:
            if attempt < 2:
                time.sleep(3)
                continue
            print(f"  ERROR {rid}: {str(e)[:60]}", flush=True)
    if (i + 1) % 10 == 0 or i + 1 == len(candidates):
        print(f"  [{i+1}/{len(candidates)}] mixed={len(mixed)} only_itau={len(only_itau)}", flush=True)
    time.sleep(0.3)

# Step 4: Results
print(f"\n[4/4] Results:", flush=True)
print(f"\nReports with BOTH ITAU and non-ITAU expenses: {len(mixed)}")
if mixed:
    print(f"\n{'Report ID':<12} {'ITAU':<8} {'Non-ITAU':<10} {'Description'}")
    print("-" * 80)
    for rid, desc, itau, non_itau in mixed:
        print(f"{rid:<12} {itau:<8} {non_itau:<10} {desc}")
    print(f"\nTotal ITAU expenses excluded from mixed reports: {total_itau_excluded}")

print(f"\nReports with ONLY ITAU expenses (already excluded, correct): {len(only_itau)}")
if only_itau:
    for rid, desc, itau in only_itau:
        print(f"  {rid}: {itau} ITAU expenses - {desc}")
