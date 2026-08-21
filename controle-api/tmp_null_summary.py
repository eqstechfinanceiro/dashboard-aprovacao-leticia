"""Quick summary: for each NULL report, extract the payment method from PDF."""
import os, psycopg2, psycopg2.extras, requests, pdfplumber, re
from collections import Counter
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

API_KEY = os.getenv("VEXPENSES_API_KEY", "")
LARAVEL_TOKEN = os.getenv("VEXPENSES_LARAVEL_TOKEN", "")

cur.execute("""
    SELECT DISTINCT ON (r.id)
           r.id as report_id, r.name as report_name, r.user_name,
           r.raw_data->>'pdf_link' as pdf_link
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
      AND e.raw_data->>'payment_method_id' IS NULL
    ORDER BY r.id
""")
reports = cur.fetchall()

pdf_dir = Path(__file__).parent / "data" / "null_pm_pdfs"
pdf_dir.mkdir(parents=True, exist_ok=True)

print(f"{'Report ID':<12} {'Report Name':<35} {'User':<35} {'Payment Methods Found'}")
print("-" * 130)

for r in reports:
    rid = r["report_id"]
    pdf_url = r["pdf_link"]
    if not pdf_url:
        print(f"{rid:<12} {r['report_name']:<35} {r['user_name']:<35} NO PDF LINK")
        continue

    pdf_path = pdf_dir / f"{rid}.pdf"
    if not pdf_path.exists():
        try:
            resp = requests.get(pdf_url,
                headers={"Authorization": API_KEY, "Cookie": f"laravel_token={LARAVEL_TOKEN}"},
                timeout=30, allow_redirects=True)
            if resp.status_code == 200 and resp.content[:4] == b'%PDF':
                pdf_path.write_bytes(resp.content)
            else:
                print(f"{rid:<12} {r['report_name']:<35} {r['user_name']:<35} DOWNLOAD FAILED")
                continue
        except Exception as e:
            print(f"{rid:<12} {r['report_name']:<35} {r['user_name']:<35} ERROR: {e}")
            continue

    try:
        with pdfplumber.open(pdf_path) as pdf:
            full_text = ""
            for page in pdf.pages:
                full_text += (page.extract_text() or "") + "\n"

            # Find payment method patterns at end of lines like "- Saque VExpenses" or "- Pix VExpenses" etc
            pm_patterns = re.findall(r'- (Saque VExpenses|Cartao Corporativo Itau|Cartao VExpenses|Pix VExpenses|Recurso Proprio|Tarifa de Saque|Desconto de Rescisao)', full_text, re.IGNORECASE)
            pm_counts = Counter(pm_patterns)

            if pm_counts:
                pm_str = ", ".join(f"{pm}({cnt})" for pm, cnt in pm_counts.most_common())
            else:
                # Try broader search
                pm_str = "NOT FOUND"
                # Check last page for payment summary
                last_page_text = pdf.pages[-1].extract_text() or ""
                lines = last_page_text.split("\n")
                for line in lines:
                    ll = line.lower()
                    if any(kw in ll for kw in ["saque", "cartao", "cartão", "pix", "recurso", "rescisao", "tarifa"]):
                        pm_str = f"LAST PAGE: {line.strip()[:80]}"
                        break

            print(f"{rid:<12} {r['report_name']:<35} {r['user_name']:<35} {pm_str}")
    except Exception as e:
        print(f"{rid:<12} {r['report_name']:<35} {r['user_name']:<35} PARSE ERROR: {e}")

conn.close()
