#!/usr/bin/env python3
"""Tenta acessar a API interna do VExpenses web app para pending approvals."""
import requests
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
LARAVEL_TOKEN = "eyJpdiI6IlV6TndpTnViSWlnV1dYNnArdDZWZEE9PSIsInZhbHVlIjoiVnYvN2QvN3h3L1Y0VmxzL3FoSVlEenRzeVIzNWlzOU93NVduZUJYUk1hd0lmamVKeTNCc0d1UmxnVTdaTzRaYjcxZkJmZHZyaGROMjdEODJ2TXdGMkxLV3NkMWFGL2E1N1hNSno3aTl0aXpCbkFsbSt4dXZCZ2h4aWM0NzY0SmdzQVpxaDRyTzlibm1yYnBwbTJ6TTdUcmpxeWZ4S2t1ZGZjVUlpRjE0SDBUdFJXblJ1RWVvV1dHSWF6UjJ6M1NTVzI1TE42eU9RMHZ2ZHByTnNsbGYySDFVR3lBZmpMY3VBVWNMQ3dmYk0zQVYxZG5vcG9LTVRpakdOSHNabnhhVnhUTjZzbXl0ZllpWXIyVzRyTERBZ2ZiUEhzeFFiaHhiRG1MeDlObFBXbEl2b1lFNUdDTEdIRk1Gb1FTZXd5RisiLCJtYWMiOiJmZmYzMTJhNTIzZjU4OTM3YzY1Yjg5YTg2NzJmOTBlNDVlZWMxYjk5NDMxNjYyZGMxNTY3ODExYTkwNjhkOTBhIiwidGFnIjoiIn0%3D"
BASE_URL = "https://api.vexpenses.com"
APP_URL = "https://app.vexpenses.com"
HEADERS_V2 = {"Authorization": API_KEY, "Accept": "application/json"}

# 1. Tentar API interna do app (com token Laravel)
print("=" * 80)
print("1. App interno - /api/pending-approvals")
print("=" * 80)
endpoints = [
    "/api/pending-approvals",
    "/api/reports/pending-approvals",
    "/api/approvals/pending",
    "/api/reports/awaiting-approval",
    "/api/v2/reports/pending-approvals",
]

for ep in endpoints:
    for base in [APP_URL, BASE_URL]:
        try:
            resp = requests.get(f"{base}{ep}", headers={
                "Cookie": f"vexpenses_session={LARAVEL_TOKEN}",
                "Accept": "application/json",
                "Authorization": API_KEY,
            }, timeout=15)
            if resp.status_code != 404:
                print(f"\n{base}{ep}: {resp.status_code}")
                print(f"  {resp.text[:300]}")
        except Exception as e:
            pass

# 2. Tentar /v2/reports/pending-approvals com PUT (já que aceita PUT)
print("\n" + "=" * 80)
print("2. PUT /v2/reports/pending-approvals com body")
print("=" * 80)
resp = requests.put(f"{BASE_URL}/v2/reports/pending-approvals", headers=HEADERS_V2, json={"id": 891980}, timeout=30)
print(f"Status: {resp.status_code}")
print(resp.text[:500])

# 3. Talvez o id precise ser passado como path com ponto diferente
# /v2/reports/pending-approvals/891980 já falhou (404)
# Mas e se for query com formato diferente?
print("\n" + "=" * 80)
print("3. Variações de query param")
print("=" * 80)
variations = [
    {"id": "891980", "include": "user"},
    {"id": 891980, "include": "user", "paginate": "true"},
    {"approver_id": 891980, "include": "user"},
    {"user_id": 891980, "include": "user"},
    {"approval_user_id": 891980, "include": "user"},
    {"approver": 891980, "include": "user"},
]
for v in variations:
    resp = requests.get(f"{BASE_URL}/v2/reports/pending-approvals", headers=HEADERS_V2, params=v, timeout=15)
    if resp.status_code != 422:
        print(f"\n  Params: {v} → Status: {resp.status_code}")
        print(f"  {resp.text[:300]}")
    else:
        errors = resp.json().get("data", {}).get("errors", {})
        error_keys = list(errors.keys())
        print(f"  Params: {v} → 422 errors on: {error_keys}")

# 4. Tentar search nos reports por approval_user_id
print("\n" + "=" * 80)
print("4. Search reports por approval_user_id")
print("=" * 80)
resp4 = requests.get(f"{BASE_URL}/v2/reports", headers=HEADERS_V2, params={
    "search": "approval_user_id:891980",
    "searchFields": "approval_user_id:=",
    "include": "user",
    "paginate": "false"
}, timeout=60)
print(f"Status: {resp4.status_code}")
if resp4.ok:
    data4 = resp4.json()
    reports4 = data4.get("data", [])
    print(f"Total: {len(reports4)}")
    if reports4:
        for r in reports4[:3]:
            print(f"  Report {r['id']} | status={r['status']} | approval_user_id={r.get('approval_user_id')}")

# 5. Verificar se há um endpoint /v2/me ou /v2/user que retorna o usuário logado
print("\n" + "=" * 80)
print("5. /v2/me ou /v2/user (usuário logado)")
print("=" * 80)
for ep in ["/v2/me", "/v2/user", "/v2/auth/me", "/v2/profile"]:
    resp = requests.get(f"{BASE_URL}{ep}", headers=HEADERS_V2, timeout=15)
    if resp.status_code != 404:
        print(f"\n  {ep}: {resp.status_code}")
        print(f"  {resp.text[:300]}")

print("\nDONE")
