#!/usr/bin/env python3
"""Testa API v3 e endpoints não documentados para approval data."""
import requests
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
LARAVEL_TOKEN = "eyJpdiI6IlV6TndpTnViSWlnV1dYNnArdDZWZEE9PSIsInZhbHVlIjoiVnYvN2QvN3h3L1Y0VmxzL3FoSVlEenRzeVIzNWlzOU93NVduZUJYUk1hd0lmamVKeTNCc0d1UmxnVTdaTzRaYjcxZkJmZHZyaGROMjdEODJ2TXdGMkxLV3NkMWFGL2E1N1hNSno3aTl0aXpCbkFsbSt4dXZCZ2h4aWM0NzY0SmdzQVpxaDRyTzlibm1yYnBwbTJ6TTdUcmpxeWZ4S2t1ZGZjVUlpRjE0SDBUdFJXblJ1RWVvV1dHSWF6UjJ6M1NTVzI1TE42eU9RMHZ2ZHByTnNsbGYySDFVR3lBZmpMY3VBVWNMQ3dmYk0zQVYxZG5vcG9LTVRpakdOSHNabnhhVnhUTjZzbXl0ZllpWXIyVzRyTERBZ2ZiUEhzeFFiaHhiRG1MeDlObFBXbEl2b1lFNUdDTEdIRk1Gb1FTZXd5RisiLCJtYWMiOiJmZmYzMTJhNTIzZjU4OTM3YzY1Yjg5YTg2NzJmOTBlNDVlZWMxYjk5NDMxNjYyZGMxNTY3ODExYTkwNjhkOTBhIiwidGFnIjoiIn0%3D"
BASE_URL = "https://api.vexpenses.com"
HEADERS_V2 = {"Authorization": API_KEY, "Accept": "application/json"}
HEADERS_V3 = {"Cookie": f"vexpenses_session={LARAVEL_TOKEN}", "Accept": "application/json"}

# 1. Tentar v3 endpoints
endpoints_v3 = [
    "/v3/reports/pending-approvals",
    "/v3/approvals",
    "/v3/approval-stages",
    "/v3/reports/approvals",
    "/v3/pay/approvals",
    "/v3/pay/reports/pending",
]

print("=" * 80)
print("API v3 - endpoints de aprovação")
print("=" * 80)
for ep in endpoints_v3:
    try:
        resp = requests.get(f"{BASE_URL}{ep}", headers=HEADERS_V3, timeout=15)
        print(f"\n{ep}: {resp.status_code}")
        if resp.ok:
            text = resp.text[:500]
            print(f"  {text}")
        elif resp.status_code != 404:
            print(f"  {resp.text[:200]}")
    except Exception as e:
        print(f"\n{ep}: ERROR - {e}")

# 2. Tentar v2 endpoints não documentados
endpoints_v2 = [
    "/v2/reports/pending-approvals",
    "/v2/reports/awaiting-approval",
    "/v2/pending-approvals",
    "/v2/approval-flow-steps",
    "/v2/approval-flow-stages",
    "/v2/reports/9824708/flow",
    "/v2/reports/9824708/steps",
    "/v2/reports/9824708/history",
    "/v2/reports/9824708/status-history",
]

print("\n" + "=" * 80)
print("API v2 - endpoints não documentados")
print("=" * 80)
for ep in endpoints_v2:
    try:
        resp = requests.get(f"{BASE_URL}{ep}", headers=HEADERS_V2, timeout=15)
        print(f"\n{ep}: {resp.status_code}")
        if resp.ok:
            text = resp.text[:500]
            print(f"  {text}")
        elif resp.status_code != 404:
            print(f"  {resp.text[:200]}")
    except Exception as e:
        print(f"\n{ep}: ERROR - {e}")

# 3. Tentar v2/reports com search por approval_stage_id
print("\n" + "=" * 80)
print("Search por approval_stage_id")
print("=" * 80)
resp = requests.get(f"{BASE_URL}/v2/reports", headers=HEADERS_V2, params={
    "search": "approval_stage_id:17480654",
    "searchFields": "approval_stage_id:=",
    "paginate": "false"
}, timeout=30)
print(f"Status: {resp.status_code}")
if resp.ok:
    data = resp.json()
    print(f"Total: {len(data.get('data', []))}")
    if data.get("data"):
        print(json.dumps(data["data"][0], indent=2, ensure_ascii=False, default=str)[:500])

# 4. Tentar v2/team-members com include=approvalFlow
print("\n" + "=" * 80)
print("Team members com include=approvalFlow")
print("=" * 80)
resp2 = requests.get(f"{BASE_URL}/v2/team-members", headers=HEADERS_V2, params={
    "paginate": "false",
    "per_page": 3,
    "include": "approvalFlow,costsCenters"
}, timeout=30)
print(f"Status: {resp2.status_code}")
if resp2.ok:
    data2 = resp2.json().get("data", [])
    if data2:
        print(json.dumps(data2[0], indent=2, ensure_ascii=False, default=str)[:2000])
else:
    print(resp2.text[:300])

# 5. Verificar se /v2/approvals aceita POST para listar (algumas APIs usam POST para queries)
print("\n" + "=" * 80)
print("POST /v2/approvals (tentar query via POST)")
print("=" * 80)
resp3 = requests.post(f"{BASE_URL}/v2/approvals", headers=HEADERS_V2, json={}, timeout=15)
print(f"Status: {resp3.status_code}")
print(resp3.text[:300])

print("\nDONE")
