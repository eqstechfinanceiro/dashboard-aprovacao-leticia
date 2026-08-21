#!/usr/bin/env python3
"""Testa a API v2 para ver campos de reports ENVIADO e approval-flows."""
import requests
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"
HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}

print("=" * 80)
print("1. REPORTS - Todos (include=user)")
print("=" * 80)
resp = requests.get(f"{BASE_URL}/v2/reports", headers=HEADERS, params={"include": "user"}, timeout=300)
data = resp.json()
reports = data.get("data", [])
print(f"Total reports: {len(reports)}")

# Contar por status
status_counts = {}
for r in reports:
    s = r.get("status", "UNKNOWN")
    status_counts[s] = status_counts.get(s, 0) + 1
print(f"Por status: {json.dumps(status_counts, indent=2)}")

# Filtrar ENVIADO
enviados = [r for r in reports if r.get("status") == "ENVIADO"]
print(f"\nReports ENVIADO: {len(enviados)}")

if enviados:
    print("\n--- Primeiros 3 reports ENVIADO (campos completos) ---")
    for i, r in enumerate(enviados[:3]):
        print(f"\n[Report {i+1}]")
        print(json.dumps(r, indent=2, ensure_ascii=False, default=str))
    
    # Analisar approval_user_id
    print("\n--- Análise de approval_user_id nos ENVIADO ---")
    with_approver = [r for r in enviados if r.get("approval_user_id")]
    without_approver = [r for r in enviados if not r.get("approval_user_id")]
    print(f"Com approval_user_id: {len(with_approver)}")
    print(f"Sem approval_user_id (null): {len(without_approver)}")
    
    if with_approver:
        print("\nPrimeiros 5 com approval_user_id:")
        for r in with_approver[:5]:
            user_name = r.get("user", {}).get("data", {}).get("name", "?") if r.get("user") else "?"
            print(f"  Report {r['id']} | user_id={r['user_id']} | approval_user_id={r['approval_user_id']} | approval_stage_id={r.get('approval_stage_id')} | user={user_name} | desc={r.get('description','')}")
    
    if without_approver:
        print("\nPrimeiros 5 sem approval_user_id:")
        for r in without_approver[:5]:
            user_name = r.get("user", {}).get("data", {}).get("name", "?") if r.get("user") else "?"
            print(f"  Report {r['id']} | user_id={r['user_id']} | approval_stage_id={r.get('approval_stage_id')} | user={user_name} | desc={r.get('description','')}")

print("\n" + "=" * 80)
print("2. APPROVAL FLOWS")
print("=" * 80)
resp2 = requests.get(f"{BASE_URL}/v2/approval-flows", headers=HEADERS, params={"paginate": "false"}, timeout=60)
if resp2.ok:
    flows_data = resp2.json()
    flows = flows_data.get("data", [])
    print(f"Total approval flows: {len(flows)}")
    for f in flows[:5]:
        print(f"\n  Flow {f['id']}: {f.get('description', '?')}")
        print(f"  use_automatic_approver: {f.get('use_automatic_approver')}")
        steps = f.get("steps", [])
        for step in steps:
            print(f"    Step order={step.get('order')} | operator={step.get('operator')} | entrance_value={step.get('entrance_value')}")
            for g in step.get("groups", []):
                print(f"      Group operator={g.get('operator')} | approvers={g.get('approvers')}")
else:
    print(f"Erro: {resp2.status_code} - {resp2.text[:500]}")

print("\n" + "=" * 80)
print("3. TEAM MEMBERS (para mapear approval_flow_id)")
print("=" * 80)
resp3 = requests.get(f"{BASE_URL}/v2/team-members", headers=HEADERS, params={"paginate": "false", "per_page": 500}, timeout=120)
if resp3.ok:
    tm_data = resp3.json()
    members = tm_data.get("data", [])
    print(f"Total team members: {len(members)}")
    
    # Mapear approval_flow_id
    flow_map = {}
    for m in members:
        fid = m.get("approval_flow_id")
        if fid:
            flow_map.setdefault(fid, []).append(m)
    
    print(f"\nMembers com approval_flow_id: {sum(len(v) for v in flow_map.values())}")
    print(f"Flows distintos: {list(flow_map.keys())}")
    
    # Para cada flow, mostrar alguns members
    for fid, mems in flow_map.items():
        flow_desc = next((f.get("description", "?") for f in flows if f["id"] == fid), "?")
        print(f"\n  Flow {fid} ({flow_desc}): {len(mems)} members")
        for m in mems[:3]:
            print(f"    {m['id']}: {m['name']} | user_type={m.get('user_type')} | active={m.get('active')}")
else:
    print(f"Erro: {resp3.status_code} - {resp3.text[:500]}")

# 4. Cruzar: para reports ENVIADO, mostrar quem é o approval_user_id no team members
print("\n" + "=" * 80)
print("4. CRUZAMENTO: ENVIADO reports → approval_user_id → team member name")
print("=" * 80)
if resp3.ok and enviados:
    member_map = {m["id"]: m for m in members}
    
    print(f"\nTotal ENVIADO: {len(enviados)}")
    for r in enviados[:10]:
        approver_id = r.get("approval_user_id")
        owner = member_map.get(r.get("user_id"), {})
        owner_name = owner.get("name", "?")
        owner_flow = owner.get("approval_flow_id", "?")
        
        if approver_id:
            approver = member_map.get(approver_id, {})
            approver_name = approver.get("name", f"ID:{approver_id} (não encontrado)")
        else:
            approver_name = "NULL"
        
        print(f"  Report {r['id']} | Owner: {owner_name} (flow={owner_flow}) | Approver: {approver_name} | Stage: {r.get('approval_stage_id')} | Desc: {r.get('description','')}")

print("\n" + "=" * 80)
print("5. REPORTS ENVIADO - incluir expenses?")
print("=" * 80)
# Testar include=user,expenses
resp4 = requests.get(f"{BASE_URL}/v2/reports", headers=HEADERS, params={"include": "user,expenses"}, timeout=300)
if resp4.ok:
    data4 = resp4.json()
    reports4 = data4.get("data", [])
    enviados4 = [r for r in reports4 if r.get("status") == "ENVIADO"]
    if enviados4:
        r = enviados4[0]
        expenses = r.get("expenses", {})
        if isinstance(expenses, dict):
            exp_list = expenses.get("data", [])
        elif isinstance(expenses, list):
            exp_list = expenses
        else:
            exp_list = []
        print(f"Report {r['id']} tem {len(exp_list)} expenses")
        if exp_list:
            print(f"Primeira expense: {json.dumps(exp_list[0], indent=2, ensure_ascii=False, default=str)[:500]}")
        else:
            print("Sem expenses no include")
            print(f"Keys do report: {list(r.keys())}")
    else:
        print("Nenhum ENVIADO encontrado")
else:
    print(f"Erro: {resp4.status_code}")

print("\nDONE")
