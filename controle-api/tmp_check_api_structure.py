#!/usr/bin/env python3
"""Check API response structure for expense payment methods."""
import os, requests, json
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
API_KEY = os.getenv("VEXPENSES_API_KEY", "")
BASE_URL = os.getenv("VEXPENSES_BASE_URL", "https://api.vexpenses.com")
HEADERS = {"Authorization": API_KEY, "Accept": "application/json"}

# Check Jackson's report (known Itau card)
rid = 7841173
resp = requests.get(f"{BASE_URL}/v2/reports/{rid}?include=expenses", headers=HEADERS, timeout=30)
data = resp.json().get("data", {})
name = data.get("name", "")
status = data.get("status", "")
total = data.get("total_value", "")
print(f"Report: {name} | status: {status} | total_value: {total}")
print(f"Report keys: {list(data.keys())}")

expenses = data.get("expenses", {}).get("data", [])
print(f"Expenses: {len(expenses)}")
if expenses:
    exp = expenses[0]
    print(f"Sample expense keys: {list(exp.keys())}")
    # Print full first expense
    print(json.dumps(exp, indent=2, default=str)[:3000])
    
    # Check for payment-related fields across all expenses
    print("\n--- Payment-related fields across all expenses ---")
    payment_fields = set()
    for e in expenses:
        for k in e.keys():
            if any(word in k.lower() for word in ["pay", "method", "card", "type", "forma", "cartao", "cartão"]):
                payment_fields.add(k)
    print(f"Payment-related field names: {payment_fields}")
    
    # Print values of those fields for first 5 expenses
    for i, e in enumerate(expenses[:5]):
        print(f"\n  Expense {i}:")
        for pf in payment_fields:
            val = e.get(pf)
            if val:
                if isinstance(val, (dict, list)):
                    print(f"    {pf}: {json.dumps(val, default=str)[:200]}")
                else:
                    print(f"    {pf}: {val}")
