import requests
import openpyxl

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
OUTPUT = r"c:\Users\italo.medrado\Desktop\Projects\Análise de dados\Leticia\dashboard-test\BASE_PREST_API_FRESH_V2.xlsx"
api_headers = {"Authorization": API_KEY, "Accept": "application/json"}

print("Fetching reports...", flush=True)
resp = requests.get(f"{API_URL}/v2/reports?include=user", headers=api_headers, timeout=120)
all_reports = resp.json().get("data", [])

def is_fatura(name):
    n = (name or "").upper()
    return "FATURA" in n or "CARTAO" in n or "CARTÃO" in n

def is_aprovado(status):
    s = (status or "").upper()
    return "APROVADO" in s or "ENVIADO" in s

filtered = {}
for r in all_reports:
    user = r.get("user", {})
    user_data = user.get("data", {}) if isinstance(user, dict) else {}
    cpf = user_data.get("cpf", "")
    if not cpf:
        continue
    if not is_aprovado(r.get("status")):
        continue
    if is_fatura(r.get("description")):
        continue
    filtered[r["id"]] = {"name": r.get("description", ""), "status": r.get("status", ""), "cpf": cpf, "nome": user_data.get("name", "")}

print(f"Filtered: {len(filtered)} reports", flush=True)

print("Loading Excel...", flush=True)
wb = openpyxl.load_workbook(OUTPUT, read_only=True)
ws = wb["BASE PREST (API)"]
existing_rids = set()
for row in ws.iter_rows(min_row=2, max_col=1, values_only=True):
    if row[0]:
        existing_rids.add(row[0])
wb.close()
print(f"In Excel: {len(existing_rids)} reports", flush=True)

missing = {rid: info for rid, info in filtered.items() if rid not in existing_rids}
print(f"\nMissing (no expenses): {len(missing)} reports\n")
print(f"{'Report ID':<12} {'Status':<12} {'CPF':<15} {'Nome':<30} {'Description'}")
print("-" * 100)
for rid in sorted(missing.keys()):
    m = missing[rid]
    print(f"{rid:<12} {m['status']:<12} {m['cpf']:<15} {m['nome']:<30} {m['name']}")
