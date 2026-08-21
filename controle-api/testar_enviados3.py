#!/usr/bin/env python3
"""Testa endpoints alternativos para descobrir quem aprova."""
import requests
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"
HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}

# 1. Report individual - ver se tem mais campos
print("=" * 80)
print("1. GET /v2/reports/9824708 (report ENVIADO individual)")
print("=" * 80)
resp = requests.get(f"{BASE_URL}/v2/reports/9824708", headers=HEADERS, params={"include": "user"}, timeout=60)
if resp.ok:
    data = resp.json().get("data", {})
    print(json.dumps(data, indent=2, ensure_ascii=False, default=str))
else:
    print(f"Erro: {resp.status_code} - {resp.text[:300]}")

# 2. Tentar /v2/reports/status/ENVIADO
print("\n" + "=" * 80)
print("2. GET /v2/reports/status/ENVIADO")
print("=" * 80)
resp2 = requests.get(f"{BASE_URL}/v2/reports/status/ENVIADO", headers=HEADERS, params={"include": "user"}, timeout=60)
if resp2.ok:
    data2 = resp2.json()
    reports2 = data2.get("data", [])
    print(f"Total: {len(reports2)}")
    if reports2:
        print(f"Primeiro: {json.dumps(reports2[0], indent=2, ensure_ascii=False, default=str)[:1000]}")
else:
    print(f"Erro: {resp2.status_code} - {resp2.text[:300]}")

# 3. Tentar /v2/approval-stages
print("\n" + "=" * 80)
print("3. GET /v2/approval-stages")
print("=" * 80)
resp3 = requests.get(f"{BASE_URL}/v2/approval-stages", headers=HEADERS, timeout=30)
print(f"Status: {resp3.status_code}")
if resp3.ok:
    print(json.dumps(resp3.json(), indent=2, ensure_ascii=False, default=str)[:1000])
else:
    print(resp3.text[:300])

# 4. Tentar /v2/reports/9824708/approvals
print("\n" + "=" * 80)
print("4. GET /v2/reports/9824708/approvals")
print("=" * 80)
resp4 = requests.get(f"{BASE_URL}/v2/reports/9824708/approvals", headers=HEADERS, timeout=30)
print(f"Status: {resp4.status_code}")
if resp4.ok:
    print(json.dumps(resp4.json(), indent=2, ensure_ascii=False, default=str)[:1000])
else:
    print(resp4.text[:300])

# 5. Tentar /v2/reports/9824708/approval-stages
print("\n" + "=" * 80)
print("5. GET /v2/reports/9824708/approval-stages")
print("=" * 80)
resp5 = requests.get(f"{BASE_URL}/v2/reports/9824708/approval-stages", headers=HEADERS, timeout=30)
print(f"Status: {resp5.status_code}")
if resp5.ok:
    print(json.dumps(resp5.json(), indent=2, ensure_ascii=False, default=str)[:1000])
else:
    print(resp5.text[:300])

# 6. Tentar /v2/approvals
print("\n" + "=" * 80)
print("6. GET /v2/approvals")
print("=" * 80)
resp6 = requests.get(f"{BASE_URL}/v2/approvals", headers=HEADERS, params={"paginate": "false"}, timeout=30)
print(f"Status: {resp6.status_code}")
if resp6.ok:
    print(json.dumps(resp6.json(), indent=2, ensure_ascii=False, default=str)[:1000])
else:
    print(resp6.text[:300])

# 7. Tentar /v2/report-approvals
print("\n" + "=" * 80)
print("7. GET /v2/report-approvals")
print("=" * 80)
resp7 = requests.get(f"{BASE_URL}/v2/report-approvals", headers=HEADERS, params={"paginate": "false"}, timeout=30)
print(f"Status: {resp7.status_code}")
if resp7.ok:
    print(json.dumps(resp7.json(), indent=2, ensure_ascii=False, default=str)[:1000])
else:
    print(resp7.text[:300])

# 8. Tentar search por approval_stage_id
print("\n" + "=" * 80)
print("8. GET /v2/approval-flows com search")
print("=" * 80)
resp8 = requests.get(f"{BASE_URL}/v2/approval-flows", headers=HEADERS, params={
    "paginate": "false",
    "search": "id:172530",
    "searchFields": "id:="
}, timeout=30)
print(f"Status: {resp8.status_code}")
if resp8.ok:
    flows = resp8.json().get("data", [])
    if flows:
        print(json.dumps(flows[0], indent=2, ensure_ascii=False, default=str)[:2000])
else:
    print(resp8.text[:300])

# 9. Tentar /v2/approval-flows/172530 (específico)
print("\n" + "=" * 80)
print("9. GET /v2/approval-flows/172530")
print("=" * 80)
resp9 = requests.get(f"{BASE_URL}/v2/approval-flows/172530", headers=HEADERS, timeout=30)
print(f"Status: {resp9.status_code}")
if resp9.ok:
    print(json.dumps(resp9.json(), indent=2, ensure_ascii=False, default=str)[:2000])
else:
    print(resp9.text[:300])

# 10. Listar todos os status possíveis
print("\n" + "=" * 80)
print("10. Todos os status de reports")
print("=" * 80)
resp10 = requests.get(f"{BASE_URL}/v2/reports", headers=HEADERS, params={"include": "user"}, timeout=300)
reports10 = resp10.json().get("data", [])
status_set = {}
for r in reports10:
    s = r.get("status", "?")
    status_set[s] = status_set.get(s, 0) + 1
print(json.dumps(status_set, indent=2))

# 11. Verificar se reports ENVIADO têm alguma correlação entre stage_id e flow steps
print("\n" + "=" * 80)
print("11. Correlação stage_id → step order (heurística)")
print("=" * 80)
# Buscar flows
resp_flows = requests.get(f"{BASE_URL}/v2/approval-flows", headers=HEADERS, params={"paginate": "false"}, timeout=60)
flows = resp_flows.json().get("data", [])
flow_map = {f["id"]: f for f in flows}

# Buscar members
resp_tm = requests.get(f"{BASE_URL}/v2/team-members", headers=HEADERS, params={"paginate": "false", "per_page": 500}, timeout=120)
members = resp_tm.json().get("data", [])
member_map = {m["id"]: m for m in members}

enviados = [r for r in reports10 if r.get("status") == "ENVIADO"]

# Para cada ENVIADO, ver o stage_id e tentar inferir o step
# Hipótese: stage_id pode ser um ID sequencial que indica qual step está ativo
# Vamos ver se há correlação entre stage_id e a "idade" do report
print("\nSample com created_at e stage_id:")
for r in enviados[:15]:
    owner = member_map.get(r.get("user_id"), {})
    fid = owner.get("approval_flow_id")
    flow = flow_map.get(fid, {})
    flow_desc = flow.get("description", "?")
    n_steps = len(flow.get("steps", []))
    print(f"  Report {r['id']} | created={r['created_at'][:10]} | stage={r.get('approval_stage_id')} | flow={fid}({flow_desc}) | n_steps={n_steps}")

print("\nDONE")
