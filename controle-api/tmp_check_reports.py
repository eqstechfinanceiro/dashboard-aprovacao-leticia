#!/usr/bin/env python3
"""Check current status of specific reports from VExpenses API."""
import os, requests, json, time
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")
BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
API_KEY = os.getenv("VEXPENSES_API_KEY", "")
HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}

report_ids = [10372756, 9823077, 9823071, 7841173]

for rid in report_ids:
    time.sleep(0.3)
    try:
        resp = requests.get(f"{BASE_URL}/v2/reports/{rid}", headers=HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.json().get("data", {})
        print(f"rid={rid}")
        print(f"  name:      {data.get('name', '')}")
        print(f"  status:    {data.get('status', '')}")
        print(f"  user:      {data.get('user_name', '')}")
        print(f"  cpf:       {data.get('user_cpf', '')}")
        print(f"  total:     {data.get('total_value', '')}")
        print(f"  created:   {data.get('created_at', '')}")
        print(f"  updated:   {data.get('updated_at', '')}")
        print(f"  approver:  {data.get('approver_id', '')}")
        print(f"  approved:  {data.get('approved_at', '')}")
        print()
    except Exception as e:
        print(f"rid={rid}: ERROR {e}")
        print()
