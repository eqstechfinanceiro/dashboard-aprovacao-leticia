"""Download PDFs for the 36 NULL pm_id expenses and extract text to identify payment method."""
import os, psycopg2, psycopg2.extras, requests, pdfplumber, re
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

API_KEY = os.getenv("VEXPENSES_API_KEY", "")
LARAVEL_TOKEN = os.getenv("VEXPENSES_LARAVEL_TOKEN", "")

# Get unique reports for NULL pm_id expenses
cur.execute("""
    SELECT DISTINCT ON (r.id)
           r.id as report_id, r.name as report_name, r.user_name,
           r.raw_data->>'pdf_link' as pdf_link,
           e.id as expense_id, e.description as expense_desc, e.value
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
      AND e.raw_data->>'payment_method_id' IS NULL
    ORDER BY r.id, e.value DESC
""")
reports = cur.fetchall()
print(f"Unique reports with NULL pm_id expenses: {len(reports)}\n")

pdf_dir = Path(__file__).parent / "data" / "null_pm_pdfs"
pdf_dir.mkdir(parents=True, exist_ok=True)

for r in reports:
    rid = r["report_id"]
    rname = r["report_name"]
    pdf_url = r["pdf_link"]
    print(f"=== Report {rid}: {rname} | User: {r['user_name']} ===")
    print(f"  PDF: {pdf_url}")

    if not pdf_url:
        print("  NO PDF LINK\n")
        continue

    pdf_path = pdf_dir / f"{rid}.pdf"
    if not pdf_path.exists():
        try:
            resp = requests.get(pdf_url,
                headers={
                    "Authorization": API_KEY,
                    "Cookie": f"laravel_token={LARAVEL_TOKEN}",
                },
                timeout=30, allow_redirects=True)
            if resp.status_code == 200 and resp.content[:4] == b'%PDF':
                pdf_path.write_bytes(resp.content)
                print(f"  Downloaded {len(resp.content)} bytes")
            else:
                print(f"  Download failed: status={resp.status_code}, content[:20]={resp.content[:20]}")
                print()
                continue
        except Exception as e:
            print(f"  Error: {e}")
            print()
            continue
    else:
        print(f"  Already downloaded")

    # Extract text
    try:
        with pdfplumber.open(pdf_path) as pdf:
            full_text = ""
            for page in pdf.pages:
                t = page.extract_text() or ""
                full_text += t + "\n"

            # Look for payment method indicators
            lines = full_text.split("\n")
            print(f"  Pages: {len(pdf.pages)}, Text length: {len(full_text)}")

            # Print first 50 lines for context
            print("  --- First 50 lines ---")
            for i, line in enumerate(lines[:50]):
                print(f"  {i:3d}: {line}")

            # Search for payment-related keywords
            keywords = ["pagamento", "cartao", "cartão", "itau", "itaú", "vexpenses",
                        "recurso", "proprio", "próprio", "saque", "pix", "rescisao",
                        "rescisão", "desconto", "folha", "forma", "metodo", "método",
                        "caixa", "dinheiro", "cash", "card", "credit", "crédito"]
            found = []
            for i, line in enumerate(lines):
                ll = line.lower()
                for kw in keywords:
                    if kw in ll:
                        found.append((i, kw, line.strip()))
                        break

            if found:
                print("  --- Payment-related lines ---")
                for i, kw, line in found:
                    print(f"  L{i:3d} [{kw}]: {line}")
            else:
                print("  No payment-related keywords found")

            print()
    except Exception as e:
        print(f"  PDF parse error: {e}\n")

conn.close()
