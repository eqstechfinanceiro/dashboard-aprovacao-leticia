#!/usr/bin/env python3
"""Extract timeline and payment type from the 4 PDFs."""
from pathlib import Path
from PyPDF2 import PdfReader

pdf_files = [
    (10372756, "CAIXA 05/2026 - JOSE CARLOS BATISTA - ENVIADO - Vexpenses", r"C:\Users\italo.medrado\Downloads\Relatório Usuários 4Ap59NWVbll0gWrXDMlY.pdf"),
    (9823077, "CAIXA 03/2026 - JOSE CARLOS BATISTA - ENVIADO - Vexpenses", r"C:\Users\italo.medrado\Downloads\Relatório Usuários 28a57vKrp6nBZQdleVo1.pdf"),
    (9823071, "CAIXA 02/2026 - JOSE CARLOS BATISTA - ENVIADO - Vexpenses", r"C:\Users\italo.medrado\Downloads\Relatório Usuários Geq3JZQZLG3RGK6V02OB.pdf"),
    (7841173, "CAIXA 07/2025 - JACKSON CAROLINO - APROVADO - Cartão Itaú", r"C:\Users\italo.medrado\Downloads\Relatório Usuários v7VM4AQpa5aX2WeNXZ2a.pdf"),
]

for rid, label, pdf_path in pdf_files:
    print(f"\n{'='*80}")
    print(f"rid={rid} | {label}")
    print(f"{'='*80}")
    
    reader = PdfReader(pdf_path)
    full_text = ""
    for page in reader.pages:
        t = page.extract_text() or ""
        full_text += t + "\n"
    
    # Extract timeline section
    if "Linha do Tempo" in full_text:
        idx = full_text.index("Linha do Tempo")
        # Find next section header (usually "Resumo" or end)
        end_idx = len(full_text)
        for marker in ["Resumo Geral", "Despesa #"]:
            pos = full_text.find(marker, idx)
            if pos > 0 and pos < end_idx:
                end_idx = pos
        timeline = full_text[idx:end_idx].strip()
        print(f"\n--- TIMELINE ---")
        print(timeline[:2000])
    
    # Extract payment types (look for "Saque VExpenses" or "Cartão" patterns)
    print(f"\n--- PAYMENT TYPES (from expense details) ---")
    import re
    # Find all payment method mentions
    payments = re.findall(r'(Saque VExpenses|Cartão Corporativo Itaú|Cartão VExpenses|Pix VExpenses|Recurso Próprio)', full_text)
    from collections import Counter
    payment_counts = Counter(payments)
    for p, c in payment_counts.most_common():
        print(f"  {p}: {c} expenses")
    
    # Extract header status (first few lines)
    lines = full_text.split("\n")
    print(f"\n--- HEADER (first 10 lines) ---")
    for line in lines[:10]:
        line = line.strip()
        if line:
            print(f"  {line}")
    
    # Extract total
    total_match = re.search(r'Total:\s*\n?\s*BRL\s*([\d.,]+)', full_text)
    if total_match:
        print(f"\n--- TOTAL: R$ {total_match.group(1)} ---")
