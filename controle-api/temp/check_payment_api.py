"""
Testar se o campo payment_method está sendo extraído corretamente da API
"""
import subprocess
import json

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"

# Pegar um ID que sabemos que tem payment_method_id
expense_id = 60918854

url = f"{BASE_URL}/v2/expenses/{expense_id}?include=user,costs_center,payment_method,expense_type,report"
print(f"Testando: {url}")

response = subprocess.run(
    ["curl.exe", "-s", "-H", f"Authorization: {API_KEY}", "-H", "Accept: application/json", url],
    capture_output=True,
    text=True
)

if response.returncode == 0:
    try:
        data = json.loads(response.stdout)
        if data.get('success') and 'data' in data:
            expense = data['data']
            print(f"\nExpense ID: {expense.get('id')}")
            print(f"Payment method (raw): {expense.get('payment_method')}")
            
            if expense.get('payment_method'):
                pm = expense['payment_method']
                print(f"Payment method type: {type(pm)}")
                print(f"Payment method keys: {pm.keys() if isinstance(pm, dict) else 'N/A'}")
                if isinstance(pm, dict):
                    print(f"Payment method data: {pm.get('data')}")
                    if pm.get('data'):
                        print(f"Payment method name: {pm['data'].get('name')}")
    except json.JSONDecodeError as e:
        print(f"Erro JSON: {e}")
