import requests
import time

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
ITAU_PMID = "627401"
api_headers = {"Authorization": API_KEY, "Accept": "application/json"}

missing_rids = [
    7511074, 7644642, 7664399, 7714250, 7714617, 7781541, 7792434, 7813599,
    7814512, 7827913, 7828184, 7841173, 7852099, 7852363, 7852406, 7852577,
    7852612, 7855420, 7881919, 7885949, 7931065, 7998764, 8052453, 8079003,
    8087166, 8109363, 8279816, 8310220, 8320041, 8398773, 8521576, 8561793,
    8630498, 8646669, 8655506, 8745288, 8891223, 8912707, 8988966, 9008722,
    9168576, 9216912, 9382027, 9919372, 9981967, 10127760, 10133111, 10141872,
    10194223, 10383163, 10450416, 10738875, 11248505,
]

print(f"Checking {len(missing_rids)} reports WITHOUT ITAU filter...\n", flush=True)
print(f"{'Report ID':<12} {'Total':<8} {'ITAU':<8} {'Non-ITAU':<10} {'Sample descriptions'}")
print("-" * 90)

total_itau = 0
total_non_itau = 0
reports_with_non_itau = []

for rid in missing_rids:
    for attempt in range(3):
        try:
            r = requests.get(
                f"{API_URL}/v2/reports/{rid}?include=expenses",
                headers=api_headers,
                timeout=30
            )
            if r.status_code == 429:
                time.sleep(10)
                continue
            if r.status_code == 404:
                print(f"{rid:<12} {'404':<8}")
                break
            r.raise_for_status()
            data = r.json()
            expenses = data.get("data", {}).get("expenses", {}).get("data", [])
            itau_count = sum(1 for e in expenses if str(e.get("payment_method_id", "")) == ITAU_PMID)
            non_itau = [e for e in expenses if str(e.get("payment_method_id", "")) != ITAU_PMID]
            total_itau += itau_count
            total_non_itau += len(non_itau)
            samples = ", ".join([e.get("title", "")[:30] for e in expenses[:3]])
            print(f"{rid:<12} {len(expenses):<8} {itau_count:<8} {len(non_itau):<10} {samples}")
            if non_itau:
                reports_with_non_itau.append(rid)
            break
        except Exception as e:
            if attempt < 2:
                time.sleep(5)
                continue
            print(f"{rid:<12} ERROR: {str(e)[:60]}")
    time.sleep(0.5)

print(f"\nSummary: {total_itau} ITAU expenses, {total_non_itau} non-ITAU expenses across {len(missing_rids)} reports")
if reports_with_non_itau:
    print(f"\nReports with NON-ITAU expenses (should be in Excel!): {reports_with_non_itau}")
else:
    print("\nAll 53 reports have ONLY ITAU expenses or zero expenses — Excel is correct.")
