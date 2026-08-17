import requests
import time
import openpyxl
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
ITAU_PMID = "627401"
OUTPUT = r"c:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\BASE_PREST_API_FRESH_V2.xlsx"
api_headers = {"Authorization": API_KEY, "Accept": "application/json"}
MAX_WORKERS = 4

print("[1/3] Loading Excel...", flush=True)
wb = openpyxl.load_workbook(OUTPUT, read_only=True)
ws = wb["BASE PREST (API)"]
excel_counts = defaultdict(int)
excel_rids = set()
for row in ws.iter_rows(min_row=2, values_only=True):
    if row[0]:
        excel_rids.add(row[0])
        excel_counts[row[0]] += 1
wb.close()
print(f"  {len(excel_rids)} reports, {sum(excel_counts.values())} expenses in Excel", flush=True)

print(f"[2/3] Fetching {len(excel_rids)} reports ({MAX_WORKERS} workers)...", flush=True)
results = {}
errors = []
lock = threading.Lock()
done = 0
t0 = time.time()
last_log = time.time()

def count_expenses(rid):
    for attempt in range(3):
        try:
            r = requests.get(
                f"{API_URL}/v2/reports/{rid}?include=expenses",
                headers=api_headers,
                timeout=30
            )
            if r.status_code == 429:
                time.sleep(10 * (attempt + 1))
                continue
            if r.status_code == 404:
                return rid, 0, 0
            r.raise_for_status()
            data = r.json()
            expenses = data.get("data", {}).get("expenses", {}).get("data", [])
            itau = sum(1 for e in expenses if str(e.get("payment_method_id", "")) == ITAU_PMID)
            non_itau = len(expenses) - itau
            return rid, itau, non_itau
        except Exception as e:
            if attempt < 2:
                time.sleep(5 * (attempt + 1))
                continue
            return rid, -1, -1
    return rid, -1, -1

with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
    futures = {executor.submit(count_expenses, rid): rid for rid in excel_rids}
    for future in as_completed(futures):
        rid, itau, non_itau = future.result()
        with lock:
            results[rid] = (itau, non_itau)
            done += 1
            if itau < 0:
                errors.append(rid)
            if done % 100 == 0 or done == len(excel_rids) or (time.time() - last_log) > 15:
                elapsed = time.time() - t0
                pct = done / len(excel_rids) * 100
                rate = done / elapsed * 60 if elapsed > 0 else 0
                eta = elapsed / done * (len(excel_rids) - done) if done > 0 else 0
                mixed = sum(1 for r in results.values() if r[0] > 0 and r[1] > 0)
                print(f"  [{done}/{len(excel_rids)}] {pct:.0f}% | mixed={mixed} | err={len(errors)} | {rate:.0f} rep/min | {elapsed:.0f}s ETA {eta:.0f}s", flush=True)
                last_log = time.time()

print(f"  Done: {len(results)} reports checked, {len(errors)} errors", flush=True)

print("[3/3] Results...", flush=True)
mixed_reports = []
for rid in sorted(results.keys()):
    itau, non_itau = results[rid]
    if itau > 0 and non_itau > 0:
        excel_count = excel_counts.get(rid, 0)
        mixed_reports.append((rid, itau, non_itau, excel_count))

print(f"\nReports with BOTH ITAU and non-ITAU expenses: {len(mixed_reports)}\n")
print(f"{'Report ID':<12} {'API ITAU':<10} {'API Non-ITAU':<14} {'Excel (non-ITAU)':<18} {'Match?'}")
print("-" * 70)
total_itau_excluded = 0
for rid, itau, non_itau, excel_count in mixed_reports:
    match = "OK" if non_itau == excel_count else f"MISMATCH (api={non_itau} excel={excel_count})"
    print(f"{rid:<12} {itau:<10} {non_itau:<14} {excel_count:<18} {match}")
    total_itau_excluded += itau

print(f"\nTotal reports with mixed expenses: {len(mixed_reports)}")
print(f"Total ITAU expenses excluded from these reports: {total_itau_excluded}")

mismatches = []
for rid in sorted(results.keys()):
    itau, non_itau = results[rid]
    if non_itau >= 0:
        excel_count = excel_counts.get(rid, 0)
        if non_itau != excel_count:
            mismatches.append((rid, itau, non_itau, excel_count))
if mismatches:
    print(f"\nMISMATCH reports (API non-ITAU != Excel count): {len(mismatches)}")
    for rid, itau, non_itau, excel_count in mismatches[:20]:
        print(f"  {rid}: API itau={itau} non_itau={non_itau} | Excel={excel_count}")
