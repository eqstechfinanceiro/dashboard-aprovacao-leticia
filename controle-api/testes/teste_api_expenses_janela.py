#!/usr/bin/env python3
"""Teste rapido: a API /v2/expenses responde para a janela 11-25/05? Quantas despesas e status?"""
import sys
from pathlib import Path
from collections import Counter

BASE = Path(__file__).parent.parent
sys.path.insert(0, str(BASE))
sys.path.insert(0, str(BASE / "src"))

# evitar carregar de arquivo (queremos testar a API real)
import src.api_client as api

# forca ignorar arquivos locais
api._expenses_from_file = {}

print("Buscando expenses 2026-05-11 a 2026-05-25 (include=user,report)...")
exp = api.get_expenses_by_period("2026-05-11", "2026-05-25", includes="user,report")
print(f"Total expenses retornadas: {len(exp)}")

if exp:
    status_counter = Counter()
    soma_aprovado = 0.0
    n_user = 0
    amostra = []
    for eid, e in exp.items():
        rep = e.get("report") or {}
        status = (rep.get("status") or "").upper()
        status_counter[status] += 1
        val = e.get("value")
        try:
            val = float(val)
        except (ValueError, TypeError):
            val = 0.0
        user = (e.get("user") or {})
        if user.get("name"):
            n_user += 1
        if status in ("APROVADO", "APPROVED"):
            soma_aprovado += val
        if len(amostra) < 4:
            amostra.append({
                "id": eid, "value": val, "status": status,
                "user": user.get("name"), "cpf": user.get("cpf"),
                "date": e.get("date"), "report_id": rep.get("id"),
            })
    print(f"\nStatus dos reports: {dict(status_counter)}")
    print(f"Soma value (status APROVADO): R$ {soma_aprovado:,.2f}")
    print(f"Expenses com user.name: {n_user}/{len(exp)}")
    print("\nAmostra:")
    for a in amostra:
        print(f"  {a}")
