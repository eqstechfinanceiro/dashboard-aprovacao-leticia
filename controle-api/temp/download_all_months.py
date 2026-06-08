"""
Script para baixar expenses mês a mês e combinar em um único arquivo
"""
import subprocess
import json
import os
import time

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"

# Meses para baixar (baseado no range do banco)
months = [
    ("2025-06-01", "2025-06-30"),
    ("2025-07-01", "2025-07-31"),
    ("2025-08-01", "2025-08-31"),
    ("2025-09-01", "2025-09-30"),
    ("2025-10-01", "2025-10-31"),
    ("2025-11-01", "2025-11-30"),
    ("2025-12-01", "2025-12-31"),
    ("2026-01-01", "2026-01-31"),
    ("2026-02-01", "2026-02-28"),
    ("2026-03-01", "2026-03-31"),
    ("2026-04-01", "2026-04-30"),
]

all_expenses = []

for start, end in months:
    print(f"\n--- Baixando {start} a {end} ---")
    page = 1
    per_page = 200
    
    while True:
        url = f"{BASE_URL}/v2/expenses?search=date:{start},{end}&searchFields=date:between&paginate=true&page={page}&per_page={per_page}&include=user,costs_center,payment_method,expense_type,report,apportionment"
        
        response = subprocess.run(
            ["curl.exe", "-s", "-H", f"Authorization: {API_KEY}", "-H", "Accept: application/json", url],
            capture_output=True,
            text=True
        )
        
        if response.returncode != 0:
            print(f"Erro na requisição: {response.stderr}")
            break
        
        try:
            data = json.loads(response.stdout)
        except json.JSONDecodeError as e:
            print(f"Erro ao parsear JSON: {e}")
            print(f"Resposta: {response.stdout[:200]}")
            print("Aguardando 10 segundos antes de tentar novamente...")
            time.sleep(10)
            continue
        
        if not data.get('success'):
            print(f"API retornou erro: {data.get('message', 'N/A')}")
            print("Aguardando 10 segundos antes de tentar novamente...")
            time.sleep(10)
            continue
        
        if 'data' not in data or not data['data']:
            print(f"Página {page}: sem dados, parando")
            break
        
        # Extrair dados de dentro da chave 'data' dos includes
        for expense in data['data']:
            if expense.get('user') and expense['user'].get('data'):
                expense['user'] = expense['user']['data']
            if expense.get('costs_center') and expense['costs_center'].get('data'):
                expense['costs_center'] = expense['costs_center']['data']
            if expense.get('payment_method') and expense['payment_method'].get('data'):
                expense['payment_method'] = expense['payment_method']['data']
            if expense.get('expense_type') and expense['expense_type'].get('data'):
                expense['expense_type'] = expense['expense_type']['data']
            if expense.get('report') and expense['report'].get('data'):
                expense['report'] = expense['report']['data']
        
        all_expenses.extend(data['data'])
        print(f"  Página {page}: {len(data['data'])} expenses (total: {len(all_expenses)})")
        page += 1
        
        # Pequena pausa entre páginas para evitar rate limiting
        time.sleep(0.5)
        
        # Limite de segurança para evitar loop infinito
        if page > 100:
            print("Limite de 100 páginas atingido")
            break
    
    # Pausa maior entre meses para evitar rate limiting
    print("Aguardando 5 segundos antes do próximo mês...")
    time.sleep(5)

print(f"\n--- Salvando {len(all_expenses):,} expenses ---")
output = {"data": all_expenses}
with open('data/expenses.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

file_size = os.path.getsize('data/expenses.json')
print(f"Arquivo salvo: {file_size:,} bytes ({file_size/1024/1024:.2f} MB)")
print("Concluído!")
