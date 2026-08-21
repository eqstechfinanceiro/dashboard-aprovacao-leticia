#!/usr/bin/env python3
"""Testa /v2/reports/pending-approvals com IDs de aprovadores."""
import requests
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"
HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}

# IDs conhecidos de aprovadores (do flow 172530 - REGIONAL CO)
# Step 1: 891980, 891977, 946419, 891979, 891904, 896335 (Gestão de Caixa)
# Step 2: 1047085, 896206 (gestores)
# Step 3: 896357 (EVERSON - diretor, >3000)
# Step 4: 895948 (ADILSON - diretor, >5000)
# Step 5: 896113 (FERNANDA - presidencia, >10000)

test_ids = [891980, 891977, 946419, 1047085, 896206, 896357, 895948, 896113]

# Buscar team members para mapear IDs → nomes
resp_tm = requests.get(f"{BASE_URL}/v2/team-members", headers=HEADERS, params={"paginate": "false", "per_page": 500}, timeout=120)
members = resp_tm.json().get("data", [])
member_map = {m["id"]: m for m in members}

print("=" * 80)
print("TESTANDO /v2/reports/pending-approvals?id=XXX")
print("=" * 80)

for uid in test_ids:
    name = member_map.get(uid, {}).get("name", f"ID:{uid}")
    print(f"\n--- Aprovador {uid} ({name}) ---")
    
    # Testar diferentes variações
    # Tentativa 1: ?id=XXX
    resp = requests.get(f"{BASE_URL}/v2/reports/pending-approvals", headers=HEADERS, params={
        "id": uid,
        "include": "user"
    }, timeout=60)
    print(f"  Status: {resp.status_code}")
    if resp.ok:
        data = resp.json()
        reports = data.get("data", [])
        print(f"  Total pendentes: {len(reports)}")
        if reports:
            print(f"  Primeiro: {json.dumps(reports[0], indent=2, ensure_ascii=False, default=str)[:600]}")
    else:
        print(f"  Erro: {resp.text[:300]}")

# Também testar /v2/reports/awaiting-approval
print("\n" + "=" * 80)
print("TESTANDO /v2/reports/awaiting-approval?id=XXX")
print("=" * 80)

for uid in test_ids[:3]:
    name = member_map.get(uid, {}).get("name", f"ID:{uid}")
    print(f"\n--- Aprovador {uid} ({name}) ---")
    resp = requests.get(f"{BASE_URL}/v2/reports/awaiting-approval", headers=HEADERS, params={
        "id": uid,
        "include": "user"
    }, timeout=60)
    print(f"  Status: {resp.status_code}")
    if resp.ok:
        data = resp.json()
        reports = data.get("data", [])
        print(f"  Total: {len(reports)}")
        if reports:
            print(f"  Primeiro: {json.dumps(reports[0], indent=2, ensure_ascii=False, default=str)[:600]}")
    else:
        print(f"  Erro: {resp.text[:300]}")

# Testar com paginate=false
print("\n" + "=" * 80)
print("TESTANDO /v2/reports/pending-approvals?id=891980&paginate=false")
print("=" * 80)
resp = requests.get(f"{BASE_URL}/v2/reports/pending-approvals", headers=HEADERS, params={
    "id": 891980,
    "include": "user",
    "paginate": "false"
}, timeout=60)
print(f"Status: {resp.status_code}")
if resp.ok:
    data = resp.json()
    reports = data.get("data", [])
    print(f"Total: {len(reports)}")
    if reports:
        # Mostrar todos os status
        statuses = {}
        for r in reports:
            s = r.get("status", "?")
            statuses[s] = statuses.get(s, 0) + 1
        print(f"Por status: {json.dumps(statuses, indent=2)}")
        # Mostrar 3 exemplos
        for r in reports[:3]:
            owner_name = r.get("user", {}).get("data", {}).get("name", "?")
            print(f"  Report {r['id']} | status={r['status']} | owner={owner_name} | stage={r.get('approval_stage_id')} | desc={r.get('description','')}")
else:
    print(f"Erro: {resp.text[:300]}")

print("\nDONE")
