"""Rebuild somase_snapshots and prestacao_expense_snapshots with:
- Cartão Itaú (pm_id=627401) exclusion
- FATURA/CARTAO report name exclusion (matching quinzena-complete route)
- APROVADO + ENVIADO status (matching quinzena-complete route)
- approval_date from raw_data for cutoff (since updated_at is NULL for all reports)
"""
import os, re, psycopg2, psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def is_fatura_or_cartao(name: str) -> bool:
    """Must match isFaturaOrCartao in quinzena-complete route and pipeline.ts"""
    n = (name or '').strip().upper()
    if not n:
        return False
    if 'CAIXA ITAU' in n or 'CAIXA ITAÚ' in n:
        return True
    if n.startswith('CAIXA'):
        return False
    if re.match(r'^(FATURA|CARTAO|CARTÃO|FATUAR|FARTUR|FATUT|FARUR|FATUTR)', n):
        return True
    if 'CARTÃO DE CRÉDITO' in n or 'CARTAO DE CREDITO' in n or 'CARTÃO DE CREDITO' in n:
        return True
    if 'CARTÃO CORPORATIVO' in n:
        return True
    if ('ITAU' in n or 'ITAÚ' in n) and 'CAIXA' not in n:
        return True
    if 'DOLAR' in n or 'DÓLAR' in n:
        return True
    if n.startswith('DESPESA') and 'FATURA' in n:
        return True
    if n.startswith('COMPLEMENTAR') and 'FATURA' in n:
        return True
    if 'CARTÃO' in n and 'CRÉDITO' in n:
        return True
    if 'CARTAO' in n and 'CREDITO' in n:
        return True
    if n.startswith('CARTÃO VEXPENSES'):
        return True
    return False

# Quinzenas to rebuild
# 2QZ Julho 2026 = '2026-07-2', cutoff = 10/08/2026
# 1QZ Julho 2026 = '2026-07-1', cutoff = 25/07/2026
# Also rebuild June since it may have been affected
quinzenas = [
    ("2026-06-1", "2026-06-25"),
    ("2026-06-2", "2026-07-10"),
    ("2026-07-1", "2026-07-25"),
    ("2026-07-2", "2026-08-10"),
]

for quinzena_id, cutoff in quinzenas:
    print(f"\n--- Rebuilding {quinzena_id} (cutoff: {cutoff}) ---")
    
    # Fetch valid report IDs (exclude FATURA/CARTAO by name)
    cur.execute("""
        SELECT r.id, r.name
        FROM prestacao_reports r
        WHERE (r.status ILIKE 'Aprovado' OR r.status ILIKE 'Enviado')
          AND r.user_cpf IS NOT NULL
          AND COALESCE((r.raw_data->>'approval_date')::timestamp, r.updated_at, '1970-01-01'::timestamp) <= %s
    """, (cutoff + " 23:59:59",))
    all_reports = cur.fetchall()
    valid_report_ids = [r["id"] for r in all_reports if not is_fatura_or_cartao(r["name"] or "")]
    excluded_count = len(all_reports) - len(valid_report_ids)
    print(f"  Reports: {len(all_reports)} total, {excluded_count} FATURA/CARTAO excluded, {len(valid_report_ids)} valid")
    
    if not valid_report_ids:
        print(f"  No valid reports, skipping")
        continue
    
    # Delete existing somase_snapshots
    cur.execute("DELETE FROM somase_snapshots WHERE quinzena = %s", (quinzena_id,))
    
    # Insert with pm_id=627401 exclusion, filtered by valid report IDs
    cur.execute("""
        INSERT INTO somase_snapshots (quinzena, user_cpf, total)
        SELECT %s, pr.user_cpf, SUM(pe.value) as total
        FROM prestacao_expenses pe
        JOIN prestacao_reports pr ON pe.report_id = pr.id
        WHERE pr.id = ANY(%s::bigint[])
          AND COALESCE(pe.raw_data->>'payment_method_id', '') != '627401'
        GROUP BY pr.user_cpf
        ON CONFLICT (quinzena, user_cpf) DO UPDATE SET total = EXCLUDED.total
    """, (quinzena_id, valid_report_ids))
    somase_count = cur.rowcount
    
    # Get total
    cur.execute("SELECT SUM(total) as t FROM somase_snapshots WHERE quinzena = %s", (quinzena_id,))
    somase_total = cur.fetchone()["t"] or 0
    
    # Delete existing expense_snapshots
    cur.execute("DELETE FROM prestacao_expense_snapshots WHERE quinzena = %s", (quinzena_id,))
    
    # Insert expense snapshots with pm_id=627401 exclusion, filtered by valid report IDs
    cur.execute("""
        INSERT INTO prestacao_expense_snapshots (id, quinzena, value, user_cpf)
        SELECT pe.id, %s, pe.value, pr.user_cpf
        FROM prestacao_expenses pe
        JOIN prestacao_reports pr ON pe.report_id = pr.id
        WHERE pr.id = ANY(%s::bigint[])
          AND COALESCE(pe.raw_data->>'payment_method_id', '') != '627401'
        ON CONFLICT (id, quinzena) DO UPDATE SET value = EXCLUDED.value, user_cpf = EXCLUDED.user_cpf
    """, (quinzena_id, valid_report_ids))
    exp_count = cur.rowcount
    
    print(f"  somase_snapshots: {somase_count} CPFs, total R$ {somase_total:,.2f}")
    print(f"  expense_snapshots: {exp_count} expenses")

conn.commit()

# Verify: check how many pm_id=627401 expenses were excluded
print(f"\n--- Verification: Cartão Itaú (627401) expenses excluded ---")
cur.execute("""
    SELECT COUNT(*) as cnt, SUM(pe.value) as total
    FROM prestacao_expenses pe
    JOIN prestacao_reports pr ON pe.report_id = pr.id
    WHERE (pr.status ILIKE 'Aprovado' OR pr.status ILIKE 'Enviado')
      AND pr.user_cpf IS NOT NULL
      AND pe.raw_data->>'payment_method_id' = '627401'
""")
row = cur.fetchone()
print(f"  Total Cartão Itaú expenses excluded: {row['cnt']} totaling R$ {row['total'] or 0:,.2f}")

# Show per-quinzena breakdown
print(f"\n--- Per-quinzena summary ---")
for quinzena_id, cutoff in quinzenas:
    cur.execute("SELECT COUNT(*) as cnt, SUM(total) as t FROM somase_snapshots WHERE quinzena = %s", (quinzena_id,))
    row = cur.fetchone()
    cur.execute("SELECT COUNT(*) as cnt FROM prestacao_expense_snapshots WHERE quinzena = %s", (quinzena_id,))
    exp = cur.fetchone()
    print(f"  {quinzena_id}: {row['cnt']} CPFs, R$ {row['t'] or 0:,.2f}, {exp['cnt']} expenses")

conn.close()
print("\nDone! Database updated with Cartão Itaú exclusion.")
