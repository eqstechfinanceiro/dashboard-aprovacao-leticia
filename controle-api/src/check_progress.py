"""Consulta o total de reports aprovados na API para estimar progresso do download."""
import requests
from dotenv import load_dotenv
from pathlib import Path
import os
import sys

BASE = Path(__file__).parent.parent
load_dotenv(BASE / ".env")

API_KEY = os.getenv("VEXPENSES_API_KEY", "")

r = requests.get(
    "https://api.vexpenses.com/v2/reports?search=status:3&paginate=true&page=1&per_page=1",
    headers={"Authorization": API_KEY, "Accept": "application/json"},
    timeout=10
)
data = r.json()

print("Estrutura da resposta:")
print(f"  Chaves: {list(data.keys())}")
if "meta" in data:
    print(f"  Meta: {data['meta']}")
if "pagination" in data:
    print(f"  Pagination: {data['pagination']}")

total = data.get("total", data.get("meta", {}).get("total", "N/A"))
last_page = data.get("last_page", data.get("meta", {}).get("last_page", "N/A"))
per_page = 50  # mesmo valor do download_prestacao_neon.py

print(f"\nTotal reports aprovados: {total}")
print(f"Total páginas: {last_page}")
print(f"Reports por página: {per_page}")
print(f"\nTempo estimado (0.8s por report):")
if total != "N/A":
    total_segundos = total * 0.8
    print(f"  {total_segundos / 60:.1f} minutos")
