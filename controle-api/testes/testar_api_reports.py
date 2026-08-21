#!/usr/bin/env python3
"""Teste diagnóstico do endpoint /v2/reports"""
import requests
import os
from dotenv import load_dotenv
from pathlib import Path

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")

BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
API_KEY = os.getenv("VEXPENSES_API_KEY", "")

HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}

# Teste 1: sem include
print("Teste 1: /v2/reports?search=status:3 (sem include)")
try:
    resp = requests.get(
        f"{BASE_URL}/v2/reports?search=status:3&paginate=true&page=1&per_page=10",
        headers=HEADERS,
        timeout=30
    )
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Resultados: {len(data.get('data', []))}")
    else:
        print(f"Erro: {resp.text[:200]}")
except Exception as e:
    print(f"Exceção: {e}")

print()

# Teste 2: com include=expenses
print("Teste 2: /v2/reports?search=status:3&include=expenses")
try:
    resp = requests.get(
        f"{BASE_URL}/v2/reports?search=status:3&paginate=true&page=1&per_page=10&include=expenses",
        headers=HEADERS,
        timeout=30
    )
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Resultados: {len(data.get('data', []))}")
    else:
        print(f"Erro: {resp.text[:200]}")
except Exception as e:
    print(f"Exceção: {e}")

print()

# Teste 3: include menor (só user)
print("Teste 3: /v2/reports?search=status:3&include=user")
try:
    resp = requests.get(
        f"{BASE_URL}/v2/reports?search=status:3&paginate=true&page=1&per_page=10&include=user",
        headers=HEADERS,
        timeout=30
    )
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Resultados: {len(data.get('data', []))}")
    else:
        print(f"Erro: {resp.text[:200]}")
except Exception as e:
    print(f"Exceção: {e}")
