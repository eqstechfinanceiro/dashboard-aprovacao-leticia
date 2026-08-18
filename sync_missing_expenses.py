import requests
import json
import time
import os
from datetime import datetime

API_URL = "https://api.vexpenses.com"
API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
headers = {"Authorization": API_KEY, "Accept": "application/json"}

NEON_URL = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"

TARGET_USERS = {
    923558: "ADAN",
    895985: "ANDRE",
    896018: "CARLOS",
    896053: "DHIEGO",
}

def is_fatura(name):
    n = (name or "").upper()
    return "FATURA" in n or "CARTAO" in n or "CARTÃO" in n

# Get all reports
print("Fetching all reports...", flush=True)
resp = requests.get(f"{API_URL}/v2/reports?include=user", headers=headers, timeout=120)
all_reports = resp.json().get("data", [])
print(f"Total reports: {len(all_reports)}", flush=True)

# Filter for our 4 users, exclude FATURA/CARTAO
user_reports = {}
for r in all_reports:
    user = r.get("user", {})
    user_data = user.get("data", {}) if isinstance(user, dict) else {}
    uid = user_data.get("id")
    if uid not in TARGET_USERS:
        continue
    if is_fatura(r.get("description") or r.get("name")):
        continue
    if uid not in user_reports:
        user_reports[uid] = []
    user_reports[uid].append(r)

total_reports = sum(len(rs) for rs in user_reports.values())
print(f"Reports to sync: {total_reports}", flush=True)

# Fetch expenses for each report via /v2/reports/{id}?include=expenses
all_expenses = []
reports_meta = []

for uid, reports in user_reports.items():
    name = TARGET_USERS[uid]
    print(f"\n--- {name} (userId={uid}): {len(reports)} reports ---", flush=True)
    
    for r in reports:
        rid = r['id']
        rname = r.get('name', '') or r.get('description', '')
        rstatus = r.get('status', '')
        
        print(f"  Report {rid} ({rname}) [{rstatus}]...", end=" ", flush=True)
        
        try:
            resp = requests.get(
                f"{API_URL}/v2/reports/{rid}?include=expenses.user",
                headers=headers,
                timeout=60
            )
            if resp.status_code == 200:
                resp_data = resp.json()
                report_data = resp_data.get('data', resp_data)
                expenses = report_data.get('expenses', {}).get('data', [])
                print(f"{len(expenses)} expenses", flush=True)
                
                # Collect report metadata
                user_data = report_data.get('user', {}).get('data', {})
                reports_meta.append({
                    'id': rid,
                    'name': rname,
                    'status': rstatus,
                    'user_id': uid,
                    'user_cpf': user_data.get('cpf', ''),
                    'user_name': user_data.get('name', ''),
                    'total_value': report_data.get('total_value', 0),
                    'created_at': r.get('created_at', ''),
                })
                
                for e in expenses:
                    raw = e
                    val = float(e.get('value', 0) or 0)
                    conv = e.get('converted_value')
                    conv = float(conv) if conv is not None else val
                    all_expenses.append({
                        'id': e['id'],
                        'report_id': rid,
                        'value': val,
                        'converted_value': conv,
                        'date': e.get('date', ''),
                        'description': e.get('description', '') or e.get('title', ''),
                        'status': rstatus,
                        'raw_data': json.dumps(raw, default=str),
                    })
            else:
                print(f"ERROR {resp.status_code}: {resp.text[:100]}", flush=True)
        except Exception as e:
            print(f"EXCEPTION: {e}", flush=True)
        
        time.sleep(0.3)  # Rate limit

print(f"\n{'=' * 60}")
print(f"Total expenses collected: {len(all_expenses)}")
print(f"Total reports: {len(reports_meta)}")

# Save to JSON for inspection
with open('sync_expenses_data.json', 'w', encoding='utf-8') as f:
    json.dump({'reports': reports_meta, 'expenses': all_expenses}, f, ensure_ascii=False, indent=2)
print(f"Saved to sync_expenses_data.json")

# Now upsert to Neon DB
print(f"\n--- Upserting to Neon DB ---", flush=True)
import psycopg2

conn = psycopg2.connect(NEON_URL)
cur = conn.cursor()

# Update reports
for r in reports_meta:
    cur.execute("""
        INSERT INTO prestacao_reports (id, name, status, user_id, user_cpf, user_name, total_value, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            status = EXCLUDED.status,
            user_id = EXCLUDED.user_id,
            user_cpf = EXCLUDED.user_cpf,
            user_name = EXCLUDED.user_name,
            total_value = EXCLUDED.total_value,
            created_at = COALESCE(EXCLUDED.created_at, prestacao_reports.created_at)
    """, (r['id'], r['name'], r['status'], r['user_id'], r['user_cpf'], r['user_name'], r['total_value'] or None, r['created_at'] or None))
conn.commit()
print(f"Upserted {len(reports_meta)} reports", flush=True)

# Update expenses
for i, e in enumerate(all_expenses):
    cur.execute("""
        INSERT INTO prestacao_expenses (id, report_id, value, date, description, status, raw_data)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            report_id = EXCLUDED.report_id,
            value = EXCLUDED.value,
            date = EXCLUDED.date,
            description = EXCLUDED.description,
            status = EXCLUDED.status,
            raw_data = EXCLUDED.raw_data
    """, (e['id'], e['report_id'], e['value'], e['date'], e['description'], e['status'], e['raw_data']))
    if (i + 1) % 100 == 0:
        conn.commit()
        print(f"  Inserted {i+1}/{len(all_expenses)}...", flush=True)
conn.commit()
print(f"Upserted {len(all_expenses)} expenses", flush=True)

# Verify
cur.execute("SELECT COUNT(*) FROM prestacao_reports")
print(f"Total reports in DB: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM prestacao_expenses")
print(f"Total expenses in DB: {cur.fetchone()[0]}")

cur.close()
conn.close()
print("\nDone!")
