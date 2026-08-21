"""Extract text from gap PDFs to find payment method info."""
from pathlib import Path
from collections import Counter, defaultdict

PDF_DIR = Path(__file__).parent.parent / "data" / "gap_pdfs"

import pdfplumber

pdfs = sorted(PDF_DIR.glob("*.pdf"))
print(f"Found {len(pdfs)} PDFs\n")

pm_counter = Counter()
pm_by_report = {}
all_lines_with_pm = []

for pdf_path in pdfs:
    rid = pdf_path.stem.split("_")[0]
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = ""
            for page in pdf.pages:
                text += page.extract_text() or ""
            lines = text.split("\n")
            report_pms = set()
            for line in lines:
                low = line.lower()
                if "cartão" in low or "cartao" in low or "itau" in low or "itaú" in low:
                    if "corporativo itaú" in low or "corporativo itau" in low:
                        pm_counter.update(["Cartão Corporativo Itaú"])
                        report_pms.add("Cartão Corporativo Itaú")
                    elif "cartão vexpenses" in low or "cartao vexpenses" in low:
                        pm_counter.update(["Cartão VExpenses"])
                        report_pms.add("Cartão VExpenses")
                    elif "recurso próprio" in low or "recurso proprio" in low:
                        pm_counter.update(["Recurso Próprio"])
                        report_pms.add("Recurso Próprio")
                    elif "saque" in low:
                        pm_counter.update(["Saque"])
                        report_pms.add("Saque")
                    elif "pix" in low:
                        pm_counter.update(["Pix"])
                        report_pms.add("Pix")
                    elif "cartão" in low or "cartao" in low:
                        all_lines_with_pm.append((rid, line.strip()))
            if not report_pms:
                # Check for "Recurso Próprio" or other payment methods
                for line in lines:
                    low = line.lower()
                    if "recurso" in low:
                        report_pms.add("Recurso Próprio")
                        pm_counter.update(["Recurso Próprio"])
                    elif "saque" in low:
                        report_pms.add("Saque")
                        pm_counter.update(["Saque"])
                    elif "pix" in low:
                        report_pms.add("Pix")
                        pm_counter.update(["Pix"])
            pm_by_report[rid] = report_pms if report_pms else {"UNKNOWN"}
    except Exception as e:
        pm_by_report[rid] = {f"ERROR: {e}"}

print("=== Payment method summary across all gap PDFs ===")
for pm, cnt in pm_counter.most_common():
    print(f"  {pm}: {cnt} mentions")

print(f"\n=== Payment methods per report ===")
for rid in sorted(pm_by_report.keys()):
    pms = pm_by_report[rid]
    print(f"  {rid}: {', '.join(sorted(pms))}")

print(f"\n=== Unclassified lines with cartão/itau ===")
for rid, line in all_lines_with_pm[:30]:
    print(f"  [{rid}] {line[:120]}")
