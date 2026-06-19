#!/usr/bin/env python3
"""Investiga approval_stage_id vs approval-flows para descobrir quem aprova."""
import requests
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"
HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}

# 1. Buscar approval flows
print("=" * 80)
print("APPROVAL FLOWS - estrutura completa")
print("=" * 80)
resp = requests.get(f"{BASE_URL}/v2/approval-flows", headers=HEADERS, params={"paginate": "false"}, timeout=60)
flows = resp.json().get("data", [])
print(f"Total: {len(flows)}")
for f in flows:
    print(f"\nFlow {f['id']}: {f.get('description','?')}")
    for step in f.get("steps", []):
        print(f"  Step order={step.get('order')} | entrance_value={step.get('entrance_value')}")
        for g in step.get("groups", []):
            print(f"    Group op={g.get('operator')} | approvers={g.get('approvers')}")

# 2. Buscar reports ENVIADO
print("\n" + "=" * 80)
print("REPORTS ENVIADO - approval_stage_id")
print("=" * 80)
resp2 = requests.get(f"{BASE_URL}/v2/reports", headers=HEADERS, params={"include": "user"}, timeout=300)
reports = resp2.json().get("data", [])
enviados = [r for r in reports if r.get("status") == "ENVIADO"]
print(f"Total ENVIADO: {len(enviados)}")

# 3. Buscar team members
resp3 = requests.get(f"{BASE_URL}/v2/team-members", headers=HEADERS, params={"paginate": "false", "per_page": 500}, timeout=120)
members = resp3.json().get("data", [])
member_map = {m["id"]: m for m in members}

# 4. Para cada ENVIADO, mostrar: owner, flow, stage_id, e tentar match com flow steps
print("\n--- Cruzamento: ENVIADO → owner flow → stage → approvers ---")
# Agrupar por flow do owner
flow_groups = {}
for r in enviados:
    owner = member_map.get(r.get("user_id"), {})
    fid = owner.get("approval_flow_id")
    if fid not in flow_groups:
        flow_groups[fid] = []
    flow_groups[fid].append(r)

for fid, reps in sorted(flow_groups.items(), key=lambda x: -len(x[1])):
    flow = next((f for f in flows if f["id"] == fid), None)
    flow_desc = flow.get("description", "?") if flow else "NOT FOUND"
    print(f"\nFlow {fid} ({flow_desc}): {len(reps)} reports ENVIADO")
    
    if flow:
        # Mostrar steps do flow
        for step in flow.get("steps", []):
            approver_ids = []
            for g in step.get("groups", []):
                approver_ids.extend(g.get("approvers", []))
            approver_names = [member_map.get(aid, {}).get("name", f"ID:{aid}") for aid in approver_ids]
            print(f"  Step order={step.get('order')} | entrance_value={step.get('entrance_value')} | approvers: {approver_names}")
        
        # Mostrar stage_ids unicos dos reports deste flow
        stage_ids = set(r.get("approval_stage_id") for r in reps)
        print(f"  Stage IDs unicos: {stage_ids}")
    
    # Mostrar 3 exemplos
    for r in reps[:3]:
        owner_name = member_map.get(r.get("user_id"), {}).get("name", "?")
        print(f"    Report {r['id']} | stage={r.get('approval_stage_id')} | owner={owner_name} | desc={r.get('description','')}")

# 5. Verificar se approval_stage_id aparece em algum lugar do flow
print("\n" + "=" * 80)
print("MATCH: approval_stage_id nos flows?")
print("=" * 80)
all_stage_ids = set(r.get("approval_stage_id") for r in enviados)
print(f"Stage IDs unicos (total): {len(all_stage_ids)}")
print(f"Primeiros 10: {list(all_stage_ids)[:10]}")

# Verificar se algum flow tem esses IDs
for sid in list(all_stage_ids)[:5]:
    found = False
    for f in flows:
        for step in f.get("steps", []):
            for g in step.get("groups", []):
                if sid in g.get("approvers", []):
                    print(f"  Stage {sid} encontrado como approver no flow {f['id']}")
                    found = True
    if not found:
        print(f"  Stage {sid} não encontrado nos flows")

# 6. Primeiro report ENVIADO completo
print("\n" + "=" * 80)
print("PRIMEIRO REPORT ENVIADO - JSON completo")
print("=" * 80)
if enviados:
    print(json.dumps(enviados[0], indent=2, ensure_ascii=False, default=str))

print("\nDONE")
