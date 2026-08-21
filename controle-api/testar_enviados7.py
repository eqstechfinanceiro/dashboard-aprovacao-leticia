#!/usr/bin/env python3
"""Testa POST e outras variações para pending-approvals."""
import requests
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"
HEADERS = {"Authorization": API_KEY, "Accept": "application/json", "Content-Type": "application/json"}

# 1. POST com body
print("=" * 80)
print("1. POST /v2/reports/pending-approvals com JSON body")
print("=" * 80)
resp = requests.post(f"{BASE_URL}/v2/reports/pending-approvals", headers=HEADERS, json={"id": 891980}, timeout=30)
print(f"Status: {resp.status_code}")
print(resp.text[:500])

# 2. Tentar com header X-HTTP-Method-Override
print("\n" + "=" * 80)
print("2. POST com override GET")
print("=" * 80)
resp2 = requests.post(f"{BASE_URL}/v2/reports/pending-approvals", headers={**HEADERS, "X-HTTP-Method-Override": "GET"}, json={"id": 891980}, timeout=30)
print(f"Status: {resp2.status_code}")
print(resp2.text[:500])

# 3. Talvez seja /v2/reports/pending-approvals e o id seja do REPORT, não do aprovador
print("\n" + "=" * 80)
print("3. GET com id de report (9824708)")
print("=" * 80)
resp3 = requests.get(f"{BASE_URL}/v2/reports/pending-approvals", headers=HEADERS, params={"id": 9824708}, timeout=30)
print(f"Status: {resp3.status_code}")
print(resp3.text[:500])

# 4. Talvez seja /v2/reports/{id}/pending-approvals
print("\n" + "=" * 80)
print("4. GET /v2/reports/9824708/pending-approvals")
print("=" * 80)
resp4 = requests.get(f"{BASE_URL}/v2/reports/9824708/pending-approvals", headers=HEADERS, timeout=30)
print(f"Status: {resp4.status_code}")
print(resp4.text[:500])

# 5. Talvez a rota precise de team-member id na URL: /v2/team-members/{id}/pending-approvals
print("\n" + "=" * 80)
print("5. GET /v2/team-members/891980/pending-approvals")
print("=" * 80)
resp5 = requests.get(f"{BASE_URL}/v2/team-members/891980/pending-approvals", headers=HEADERS, timeout=30)
print(f"Status: {resp5.status_code}")
print(resp5.text[:500])

# 6. Tentar /v2/team-members/{id}/reports
print("\n" + "=" * 80)
print("6. GET /v2/team-members/891980/reports")
print("=" * 80)
resp6 = requests.get(f"{BASE_URL}/v2/team-members/891980/reports", headers=HEADERS, params={"include": "user"}, timeout=30)
print(f"Status: {resp6.status_code}")
if resp6.ok:
    data6 = resp6.json()
    reports6 = data6.get("data", [])
    print(f"Total: {len(reports6)}")
    if reports6:
        statuses = {}
        for r in reports6:
            s = r.get("status", "?")
            statuses[s] = statuses.get(s, 0) + 1
        print(f"Por status: {json.dumps(statuses)}")
        for r in reports6[:3]:
            print(f"  Report {r['id']} | status={r['status']} | stage={r.get('approval_stage_id')} | desc={r.get('description','')}")
else:
    print(resp6.text[:300])

# 7. Abordagem alternativa: buscar reports ENVIADO e cruzar com flows
# Vamos analisar se conseguimos inferir o step atual pelo stage_id
print("\n" + "=" * 80)
print("7. ANÁLISE: Agrupar ENVIADO por flow e stage_id")
print("=" * 80)
resp7 = requests.get(f"{BASE_URL}/v2/reports", headers=HEADERS, params={"include": "user"}, timeout=300)
reports7 = resp7.json().get("data", [])
enviados = [r for r in reports7 if r.get("status") == "ENVIADO"]

resp_tm = requests.get(f"{BASE_URL}/v2/team-members", headers=HEADERS, params={"paginate": "false", "per_page": 500}, timeout=120)
members = resp_tm.json().get("data", [])
member_map = {m["id"]: m for m in members}

resp_flows = requests.get(f"{BASE_URL}/v2/approval-flows", headers=HEADERS, params={"paginate": "false"}, timeout=60)
flows = resp_flows.json().get("data", [])
flow_map = {f["id"]: f for f in flows}

# Para cada flow, ver os stage_ids e tentar correlacionar com steps
print("\nFlow 172530 (REGIONAL CO) - 5 steps:")
flow = flow_map[172530]
for step in flow["steps"]:
    approver_names = []
    for g in step["groups"]:
        for aid in g["approvers"]:
            approver_names.append(member_map.get(aid, {}).get("name", f"ID:{aid}"))
    print(f"  Step {step['order']}: entrance_value={step.get('entrance_value')} | approvers={approver_names}")

co_enviados = [r for r in enviados if member_map.get(r.get("user_id"), {}).get("approval_flow_id") == 172530]
print(f"\n  Reports ENVIADO neste flow: {len(co_enviados)}")
for r in co_enviados:
    owner = member_map.get(r.get("user_id"), {}).get("name", "?")
    print(f"    Report {r['id']} | stage={r.get('approval_stage_id')} | owner={owner} | created={r['created_at'][:10]} | desc={r.get('description','')}")

# 8. Verificar se reports APROVADO do mesmo flow têm approval_user_id preenchido
print("\n" + "=" * 80)
print("8. Reports APROVADO do flow 172530 - quem aprovou?")
print("=" * 80)
co_aprovados = [r for r in reports7 if r.get("status") == "APROVADO" and member_map.get(r.get("user_id"), {}).get("approval_flow_id") == 172530]
print(f"Total APROVADO no flow 172530: {len(co_aprovados)}")
# Verificar approval_user_id
with_approver = [r for r in co_aprovados if r.get("approval_user_id")]
without_approver = [r for r in co_aprovados if not r.get("approval_user_id")]
print(f"Com approval_user_id: {len(with_approver)}")
print(f"Sem approval_user_id: {len(without_approver)}")
if with_approver:
    print("\nPrimeiros 10 APROVADO com approval_user_id:")
    for r in with_approver[:10]:
        approver_name = member_map.get(r.get("approval_user_id"), {}).get("name", f"ID:{r['approval_user_id']}")
        owner_name = member_map.get(r.get("user_id"), {}).get("name", "?")
        print(f"  Report {r['id']} | owner={owner_name} | approver={approver_name} (id={r['approval_user_id']}) | stage={r.get('approval_stage_id')} | approval_date={r.get('approval_date','')[:10]}")

print("\nDONE")
