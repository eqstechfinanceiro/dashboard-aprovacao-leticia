"""Patch the 36 NULL pm_id expenses based on PDF investigation results."""
import os, psycopg2, psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Report -> payment_method_id mapping based on PDF analysis
# 627721 = Saque VExpenses, 668240 = Pix VExpenses, 627508 = Cartao VExpenses
REPORT_PM = {
    9695987:  ("627721", "Saque VExpenses"),       # CARLOS RENATO - all Saque
    9759226:  ("627508", "Cartao VExpenses"),       # EDIBERTO - Cartao VExpenses
    9792680:  ("627721", "Saque VExpenses"),       # ADSON - all Saque
    9830796:  ("627721", "Saque VExpenses"),       # CARLOS RENATO - all Saque
    10109831: ("627721", "Saque VExpenses"),       # AGNO - all Saque
    10377106: ("627721", "Saque VExpenses"),       # AGNO - all Saque
    10597789: ("627721", "Saque VExpenses"),       # RUBENS - all Saque
    10639294: ("627721", "Saque VExpenses"),       # JOELSON - mostly Saque (40), some Pix (11)
    10658622: ("627721", "Saque VExpenses"),       # ABNER - all Saque
    10664463: ("627721", "Saque VExpenses"),       # SANDRO - mostly Saque (4), 1 Pix
    10794955: ("627721", "Saque VExpenses"),       # LARISSA - all Saque
    10874586: ("627721", "Saque VExpenses"),       # GERSON - all Saque
    10918481: ("627721", "Saque VExpenses"),       # ABNER - all Saque
}

for report_id, (pm_id, pm_name) in REPORT_PM.items():
    cur.execute("""
        UPDATE prestacao_expenses e
        SET raw_data = COALESCE(e.raw_data, '{}'::jsonb) || jsonb_build_object(
            'payment_method_id', %s,
            'payment_method_name', %s
        )
        WHERE e.report_id = %s
          AND e.raw_data->>'payment_method_id' IS NULL
    """, (pm_id, pm_name, report_id))
    print(f"Report {report_id}: patched {cur.rowcount} expenses with pm_id={pm_id} ({pm_name})")
    conn.commit()

# Verify
cur.execute("""
    SELECT (e.raw_data->>'payment_method_id') as pm_id, COUNT(*) as cnt, SUM(e.value) as total
    FROM prestacao_expenses e
    JOIN prestacao_reports r ON e.report_id = r.id
    WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
      AND r.user_cpf IS NOT NULL
    GROUP BY 1 ORDER BY COUNT(*) DESC
""")
print("\n--- Final distribution ---")
for r in cur.fetchall():
    pm = str(r["pm_id"] or "NULL")
    print(f"  pm_id={pm:>10s}  count={r['cnt']:>6d}  total=R$ {float(r['total']):>14,.2f}")

conn.close()
