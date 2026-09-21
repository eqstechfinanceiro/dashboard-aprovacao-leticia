import requests
import openpyxl

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
ITAU_PMID = "627401"
OUTPUT = r"c:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\BASE_PREST_API_FRESH_V2.xlsx"
api_headers = {"Authorization": API_KEY, "Accept": "application/json"}

wb = openpyxl.load_workbook(OUTPUT, read_only=True)
ws = wb["BASE PREST (API)"]
excel_rids = set()
for row in ws.iter_rows(min_row=2, max_col=1, values_only=True):
    if row[0]:
        excel_rids.add(row[0])
wb.close()

resp = requests.get(f"{API_URL}/v2/reports?include=user", headers=api_headers, timeout=120)
reports = resp.json().get("data", [])

candidates = []
for r in reports:
    rid = r["id"]
    if rid not in excel_rids:
        continue
    desc = (r.get("description") or "").upper()
    rpmid = str(r.get("payment_method_id", ""))
    if "ITAU" in desc or "CARTAO" in desc or "CARTÃO" in desc or rpmid == ITAU_PMID:
        user = r.get("user", {}).get("data", {})
        candidates.append({
            "id": rid,
            "desc": r.get("description", ""),
            "pmid": rpmid,
            "status": r.get("status", ""),
            "nome": user.get("name", ""),
            "cpf": user.get("cpf", ""),
        })

print(f"7 candidates (in Excel + ITAU/CARTAO in description or ITAU payment method):\n")
print(f"{'Report ID':<12} {'PMID':<10} {'Status':<12} {'Nome':<35} {'Description'}")
print("-" * 110)
for c in candidates:
    print(f"{c['id']:<12} {c['pmid']:<10} {c['status']:<12} {c['nome']:<35} {c['desc']}")
