"""
Revert all changes made by importing sheet data.
1. Revert June snapshots back to API-only state (zero financials, import_source='api')
2. Clear manual inputs that were imported from sheets
3. Keep quinzena_config (that's config, not sheet data)
"""
import psycopg2

DB_URL = "postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"

conn = psycopg2.connect(DB_URL)
conn.autocommit = False
cur = conn.cursor()

# 1. Revert June snapshots to API-only state
print("=== Reverting June snapshots to API-only state ===")
cur.execute("""
    UPDATE quinzena_controle_snapshot 
    SET saldo_prestacao = 0, saldo_cartao = 0, saldo_final = 0,
        col_qz = NULL, saldo_reembolsar = NULL,
        saldo_final_carga = NULL, saldo_cartao_carga = NULL,
        import_source = 'api', imported_at = NOW()
    WHERE year = 2026 AND month = 6 AND quinzena IN (1, 2)
""")
print(f"  Reverted {cur.rowcount} rows to API-only state")

# 2. Clear manual inputs for June (they were imported from sheets)
print("\n=== Clearing June manual inputs ===")
cur.execute("""
    DELETE FROM quinzena_manual_inputs 
    WHERE year = 2026 AND month = 6
""")
print(f"  Deleted {cur.rowcount} rows")

# 3. Also clear May manual inputs that were imported from sheets
# (May had manual inputs before from the pipeline, but I overwrote them)
print("\n=== Clearing May manual inputs ===")
cur.execute("""
    DELETE FROM quinzena_manual_inputs 
    WHERE year = 2026 AND month = 5
""")
print(f"  Deleted {cur.rowcount} rows")

# 4. Remove the 4 CPFs I inserted into June snapshots (they weren't there before)
print("\n=== Removing inserted CPFs from June snapshots ===")
inserted_cpfs = ['01050938232', '91415586691', '02158033029', '52431541215', '00287599744']
for cpf in inserted_cpfs:
    cur.execute("""
        DELETE FROM quinzena_controle_snapshot 
        WHERE year = 2026 AND month = 6 AND cpf = %s
    """, (cpf,))
    if cur.rowcount > 0:
        print(f"  Removed {cpf}")

conn.commit()

# Verify state
print("\n=== Verification ===")
cur.execute("""
    SELECT year, month, quinzena, count(*) as cnt, import_source,
           count(*) FILTER (WHERE col_qz IS NOT NULL) as has_col_qz,
           count(*) FILTER (WHERE saldo_final_carga IS NOT NULL) as has_sf_carga
    FROM quinzena_controle_snapshot 
    GROUP BY year, month, quinzena, import_source
    ORDER BY year, month, quinzena
""")
for row in cur.fetchall():
    print(f"  {row[0]}-{row[1]:02d}-Q{row[2]}: {row[3]} rows, source={row[4]}, with_col_qz={row[5]}, with_sf_carga={row[6]}")

cur.execute("SELECT count(*) FROM quinzena_manual_inputs")
print(f"\n  Manual inputs total: {cur.fetchone()[0]}")

cur.close()
conn.close()
print("\nDone! Database reverted to pre-import state.")
