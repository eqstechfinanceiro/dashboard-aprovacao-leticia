import requests
import json

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

# The error said "Filter fields are required"
# Let's try various filter combinations

tests = [
    # Date-based filters
    ("?date=2025-06-01", "date single"),
    ("?from=2025-06-01&to=2026-12-31", "from/to"),
    ("?initial_date=2025-06-01&final_date=2026-12-31", "initial/final date"),
    ("?start=2025-06-01&end=2026-12-31", "start/end"),
    # Maybe it wants specific field names from the API
    ("?expense_id=7603397", "expense_id"),
    ("?report_expense_id=7603397", "report_expense_id"),
    # Try filter[] syntax (Laravel-style)
    ("?filter[user_id]=895944", "filter[user_id]"),
    ("?filter[date]=2025-06-01", "filter[date]"),
    # Try search syntax
    ("?search=7603397", "search"),
    # Maybe it needs company_id
    ("?company_id=1825947", "company_id"),
    ("?paying_company_id=1861279", "paying_company_id"),
    # Try with per_page and page
    ("?per_page=10&page=1&company_id=1825947", "per_page+company"),
    # Try approval_status or status
    ("?status=APROVADO", "status"),
    ("?approval_status=APROVADO", "approval_status"),
    # Maybe it wants 'fields' param
    ("?fields=id,value,title&user_id=895944", "fields+user_id"),
    # Try q parameter
    ("?q=test", "q"),
    # Try with all possible filter names from the report structure
    ("?user_id=895944&date=2025-06-01", "user_id+date"),
    ("?user_id=895944&initial_date=2025-01-01&final_date=2026-12-31", "user_id+date range"),
]

for params, desc in tests:
    try:
        r = requests.get(f"{API_URL}/v2/expenses{params}", headers=headers, timeout=15)
        status = r.status_code
        if status == 200:
            data = r.json()
            d = data.get("data", [])
            meta = data.get("meta", {})
            print(f"  [OK] {desc}: {params} -> {len(d)} results, meta={json.dumps(meta, default=str)[:200]}")
            if d:
                print(f"       sample keys: {list(d[0].keys())[:10]}")
        else:
            body = r.text[:150]
            print(f"  [{status}] {desc}: {params} -> {body}")
    except Exception as e:
        print(f"  [ERR] {desc}: {params} -> {e}")

# Also try the reports endpoint with different includes to see if expenses can come bundled
print("\n=== Trying reports with expenses include (bulk) ===")
for params in [
    "?include=expenses,user",
    "?include=expenses.user",
    "?include=expenses,user&per_page=5",
    "?include=user.expenses",
    "?include=user,expenses&per_page=2",
]:
    try:
        r = requests.get(f"{API_URL}/v2/reports{params}", headers=headers, timeout=30)
        if r.status_code == 200:
            data = r.json()
            d = data.get("data", [])
            meta = data.get("meta", {})
            print(f"  [OK] {params} -> {len(d)} reports, meta={json.dumps(meta, default=str)[:200]}")
            if d:
                r0 = d[0]
                print(f"       report keys: {list(r0.keys())}")
                if "expenses" in r0:
                    exp = r0["expenses"]
                    if isinstance(exp, dict):
                        ed = exp.get("data", [])
                        print(f"       expenses in report: {len(ed)}")
                    elif isinstance(exp, list):
                        print(f"       expenses in report: {len(exp)}")
        else:
            print(f"  [{r.status_code}] {params} -> {r.text[:150]}")
    except Exception as e:
        print(f"  [ERR] {params} -> {e}")
