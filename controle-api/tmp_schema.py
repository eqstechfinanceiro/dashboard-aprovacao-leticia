import os, psycopg2, psycopg2.extras, json, requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
API_KEY = os.getenv("VEXPENSES_API_KEY", "")

# Find expenses with NULL payment_method_id in DB, from gap reports
# Pick a mix: some from "CAIXA" reports (suspected ITAU) and some from other reports
cur.execute("""
    SELECT e.id, e.report_id, e.value, e.description,
           r.name as report_name, r.user_name,
           (e.raw_data->>'payment_method_id') as pm_id
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
      AND (e.raw_data->>'payment_method_id') IS NULL
    ORDER BY e.value DESC
    LIMIT 20
""")

null_expenses = cur.fetchall()
print(f"Found {len(null_expenses)} expenses with NULL pm_id in DB\n")

for exp in null_expenses:
    eid = exp["id"]
    print(f"--- Expense {eid} (R$ {float(exp['value']):,.2f}) | Report: {exp['report_name']} | User: {exp['user_name']} ---")
    try:
        resp = requests.get(f"https://api.vexpenses.com/v2/expenses/{eid}",
            headers={"Authorization": API_KEY, "Accept": "application/json"},
            params={"include": "payment_method"},
            timeout=30)
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            pm_id_api = data.get("payment_method_id")
            pm_obj = data.get("payment_method", {}).get("data", {})
            pm_name = pm_obj.get("description", "?") if pm_obj else "NO payment_method object"
            print(f"  API pm_id: {pm_id_api}")
            print(f"  API pm_name: {pm_name}")
        else:
            print(f"  API status: {resp.status_code}")
    except Exception as e:
        print(f"  ERROR: {e}")
    print()

conn.close()
