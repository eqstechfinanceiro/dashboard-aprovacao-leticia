#!/usr/bin/env python3
"""Check report status in Neon DB and extract text from PDFs."""
import os, psycopg2, psycopg2.extras, json
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"), connect_timeout=10)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

report_ids = [10372756, 9823077, 9823071, 7841173]

print("=== Neon DB status ===")
for rid in report_ids:
    cur.execute("""
        SELECT id, name, status, user_name, user_cpf, total_value, created_at, updated_at
        FROM prestacao_reports WHERE id = %s
    """, (rid,))
    row = cur.fetchone()
    if row:
        print(f"rid={rid}")
        print(f"  name:    {row['name']}")
        print(f"  status:  {row['status']}")
        print(f"  user:    {row['user_name']}")
        print(f"  cpf:     {row['user_cpf']}")
        print(f"  total:   {row['total_value']}")
        print(f"  created: {row['created_at']}")
        print(f"  updated: {row['updated_at']}")
        print()
    else:
        print(f"rid={rid}: NOT FOUND IN DB")
        print()

# Also check: what's in the raw_data for these reports?
print("=== Raw data (approval info) ===")
for rid in report_ids:
    cur.execute("SELECT id, name, status, raw_data FROM prestacao_reports WHERE id = %s", (rid,))
    row = cur.fetchone()
    if row and row["raw_data"]:
        try:
            raw = json.loads(row["raw_data"]) if isinstance(row["raw_data"], str) else row["raw_data"]
            print(f"rid={rid}: {row['name']}")
            print(f"  status: {row['status']}")
            # Look for approval/reproval info
            for key in ["approver_id", "approved_at", "reproved_at", "reprover_id", "comment", "history", "approvals"]:
                if key in raw:
                    val = raw[key]
                    if isinstance(val, (list, dict)):
                        print(f"  {key}: {json.dumps(val, indent=2, default=str)[:500]}")
                    else:
                        print(f"  {key}: {val}")
            print()
        except Exception as e:
            print(f"rid={rid}: parse error: {e}")
            print()

conn.close()

# Now try to extract text from PDFs
print("\n=== PDF text extraction ===")
pdf_files = [
    (10372756, "CAIXA 05/2026 JOSE CARLOS BATISTA", r"C:\Users\italo.medrado\Downloads\Relatório Usuários 4Ap59NWVbll0gWrXDMlY.pdf"),
    (9823077, "CAIXA 03/2026 JOSE CARLOS BATISTA", r"C:\Users\italo.medrado\Downloads\Relatório Usuários 28a57vKrp6nBZQdleVo1.pdf"),
    (9823071, "CAIXA 02/2026 JOSE CARLOS BATISTA", r"C:\Users\italo.medrado\Downloads\Relatório Usuários Geq3JZQZLG3RGK6V02OB.pdf"),
    (7841173, "CAIXA 07/2025 JACKSON CAROLINO", r"C:\Users\italo.medrado\Downloads\Relatório Usuários v7VM4AQpa5aX2WeNXZ2a.pdf"),
]

try:
    import subprocess
    for rid, label, pdf_path in pdf_files:
        print(f"\n--- rid={rid} {label} ---")
        print(f"  File: {pdf_path}")
        if not Path(pdf_path).exists():
            print(f"  FILE NOT FOUND")
            continue
        # Try pdftotext if available
        try:
            result = subprocess.run(["pdftotext", "-layout", pdf_path, "-"], capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                text = result.stdout
                # Print first 2000 chars
                print(text[:2000])
            else:
                print(f"  pdftotext failed: {result.stderr}")
        except FileNotFoundError:
            print("  pdftotext not available, trying PyPDF2...")
            try:
                from PyPDF2 import PdfReader
                reader = PdfReader(pdf_path)
                for i, page in enumerate(reader.pages[:5]):
                    text = page.extract_text()
                    if text:
                        print(f"  [Page {i+1}]")
                        print(text[:1500])
            except ImportError:
                print("  PyPDF2 not available, trying pdfplumber...")
                try:
                    import pdfplumber
                    with pdfplumber.open(pdf_path) as pdf:
                        for i, page in enumerate(pdf.pages[:5]):
                            text = page.extract_text()
                            if text:
                                print(f"  [Page {i+1}]")
                                print(text[:1500])
                except ImportError:
                    print("  No PDF library available. Install: pip install pdfplumber")
except Exception as e:
    print(f"PDF extraction error: {e}")
