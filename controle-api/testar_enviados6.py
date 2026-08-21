#!/usr/bin/env python3
"""Testa /v2/reports/pending-approvals/{id} como path parameter."""
import requests
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"
HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}

# Buscar team members
resp_tm = requests.get(f"{BASE_URL}/v2/team-members", headers=HEADERS, params={"paginate": "false", "per_page": 500}, timeout=120)
members = resp_tm.json().get("data", [])
member_map = {m["id"]: m for m in members}

test_ids = [891980, 891977, 1047085, 896357, 895948, 896113]

print("=" * 80)
print("TESTANDO /v2/reports/pending-approvals/{id} (path param)")
print("=" * 80)

for uid in test_ids:
    name = member_map.get(uid, {}).get("name", f"ID:{uid}")
    print(f"\n--- Aprovador {uid} ({name}) ---")
    
    resp = requests.get(f"{BASE_URL}/v2/reports/pending-approvals/{uid}", headers=HEADERS, params={
        "include": "user"
    }, timeout=60)
    print(f"  Status: {resp.status_code}")
    if resp.ok:
        data = resp.json()
        reports = data.get("data", [])
        print(f"  Total pendentes: {len(reports)}")
        if reports:
            statuses = {}
            for r in reports:
                s = r.get("status", "?")
                statuses[s] = statuses.get(s, 0) + 1
            print(f"  Por status: {json.dumps(statuses)}")
            for r in reports[:3]:
                owner_name = r.get("user", {}).get("data", {}).get("name", "?")
                print(f"    Report {r['id']} | status={r['status']} | owner={owner_name} | stage={r.get('approval_stage_id')} | desc={r.get('description','')}")
    else:
        print(f"  Erro: {resp.text[:300]}")

# Também testar awaiting-approval/{id}
print("\n" + "=" * 80)
print("TESTANDO /v2/reports/awaiting-approval/{id}")
print("=" * 80)
for uid in test_ids[:3]:
    name = member_map.get(uid, {}).get("name", f"ID:{uid}")
    print(f"\n--- {uid} ({name}) ---")
    resp = requests.get(f"{BASE_URL}/v2/reports/awaiting-approval/{uid}", headers=HEADERS, params={"include": "user"}, timeout=60)
    print(f"  Status: {resp.status_code}")
    if resp.ok:
        data = resp.json()
        reports = data.get("data", [])
        print(f"  Total: {len(reports)}")
        if reports:
            for r in reports[:2]:
                print(f"    {json.dumps(r, indent=2, ensure_ascii=False, default=str)[:500]}")
    else:
        print(f"  Erro: {resp.text[:300]}")

print("\nDONE")
