"""
Teste simples para verificar se a API está retornando includes corretamente.
Baixa apenas 1 expense com includes para debug.
"""
import subprocess
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"

# Baixar apenas 1 expense com includes
url = f"{BASE_URL}/v2/expenses?search=date:2025-08-01,2025-08-01&searchFields=date:between&paginate=true&page=1&per_page=1&include=user,costs_center,payment_method,expense_type,report,apportionment"

print("Testando API com includes...")
print(f"URL: {url}")

response = subprocess.run(
    ["curl.exe", "-s", "-H", f"Authorization: {API_KEY}", "-H", "Accept: application/json", url],
    capture_output=True,
    text=True
)

if response.returncode == 0:
    data = json.loads(response.stdout)
    print(f"\nResposta da API:")
    print(f"Success: {data.get('success')}")
    print(f"Total: {data.get('total', 'N/A')}")
    
    if 'data' in data and data['data']:
        expense = data['data'][0]
        print(f"\nExpense ID: {expense.get('id')}")
        print(f"Date: {expense.get('date')}")
        print(f"Value: {expense.get('value')}")
        
        print(f"\n--- INCLUDES ---")
        print(f"User: {expense.get('user')}")
        print(f"Costs Center: {expense.get('costs_center')}")
        print(f"Payment Method: {expense.get('payment_method')}")
        print(f"Expense Type: {expense.get('expense_type')}")
        print(f"Report: {expense.get('report')}")
        
        # Verificar se os includes têm dados
        has_user = expense.get('user') and expense['user'].get('name')
        has_cc = expense.get('costs_center') and expense['costs_center'].get('name')
        has_pm = expense.get('payment_method') and expense['payment_method'].get('name')
        has_et = expense.get('expense_type') and expense['expense_type'].get('name')
        has_report = expense.get('report') and expense['report'].get('name')
        
        print(f"\n--- STATUS DOS INCLUDES ---")
        print(f"User preenchido: {has_user}")
        print(f"Costs Center preenchido: {has_cc}")
        print(f"Payment Method preenchido: {has_pm}")
        print(f"Expense Type preenchido: {has_et}")
        print(f"Report preenchido: {has_report}")
    else:
        print("Nenhum expense retornado")
else:
    print(f"Erro na requisição: {response.stderr}")
