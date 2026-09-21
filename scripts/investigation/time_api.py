import requests
import time

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

# Time 5 individual report requests
report_ids = [7603397, 7652117, 7718339, 7785900, 7897474]

print("=== Timing individual report+expenses requests ===")
times = []
for rid in report_ids:
    t0 = time.time()
    r = requests.get(f"{API_URL}/v2/reports/{rid}?include=expenses", headers=headers, timeout=30)
    elapsed = time.time() - t0
    times.append(elapsed)
    if r.status_code == 200:
        data = r.json()
        expenses = data.get("data", {}).get("expenses", {}).get("data", [])
        print(f"  Report {rid}: {elapsed:.2f}s | {len(expenses)} expenses | status={r.status_code}")
    else:
        print(f"  Report {rid}: {elapsed:.2f}s | status={r.status_code}")

avg = sum(times) / len(times)
print(f"\nAvg time per report: {avg:.2f}s")
print(f"With 10 workers: ~{avg * 4837 / 10:.0f}s = {avg * 4837 / 10 / 60:.1f}min")
print(f"With 3 workers: ~{avg * 4837 / 3:.0f}s = {avg * 4837 / 3 / 60:.1f}min")

# Also time the bulk reports list
print("\n=== Timing bulk reports list ===")
t0 = time.time()
r = requests.get(f"{API_URL}/v2/reports?include=user", headers=headers, timeout=300)
elapsed = time.time() - t0
print(f"  Reports list: {elapsed:.2f}s | {len(r.json().get('data', []))} reports")
