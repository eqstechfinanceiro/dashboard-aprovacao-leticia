import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()

# 1. Delete remaining 14 excel-import duplicates (keep lowest id)
cur.execute("""
  DELETE FROM resultados_notas
  WHERE id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY REGEXP_REPLACE(numero_nota, '^0+', ''), data, valor
        ORDER BY id ASC
      ) as rn
      FROM resultados_notas
      WHERE numero_nota IS NOT NULL AND numero_nota != ''
    ) t WHERE rn > 1
  )
""")
print(f"Deleted excel-import duplicates: {cur.rowcount}")

# 2. Fix feita_pelo_bot: excel-import entries should NOT be marked as bot
# Only lince-automacao and conferencia entries should be bot=true
cur.execute("""
  UPDATE resultados_notas 
  SET feita_pelo_bot = false 
  WHERE fonte = 'excel-import' AND feita_pelo_bot = true
""")
print(f"Fixed feita_pelo_bot (excel-import -> false): {cur.rowcount}")

conn.commit()

# Verify
cur.execute("""
  SELECT fonte, feita_pelo_bot, COUNT(*) 
  FROM resultados_notas 
  GROUP BY fonte, feita_pelo_bot 
  ORDER BY fonte, feita_pelo_bot
""")
print(f"\nFinal feita_pelo_bot distribution:")
for r in cur.fetchall():
    print(f"  fonte={r[0]} bot={r[1]} count={r[2]}")

cur.execute("SELECT COUNT(*) FROM resultados_notas")
total = cur.fetchone()[0]
print(f"\nTotal: {total}")

# Check no more duplicates
cur.execute("""
  SELECT COUNT(*) FROM (
    SELECT REGEXP_REPLACE(numero_nota, '^0+', ''), data, valor, COUNT(*) as cnt
    FROM resultados_notas
    WHERE numero_nota IS NOT NULL AND numero_nota != ''
    GROUP BY REGEXP_REPLACE(numero_nota, '^0+', ''), data, valor
    HAVING COUNT(*) > 1
  ) t
""")
remaining_dups = cur.fetchone()[0]
print(f"Remaining duplicate groups: {remaining_dups}")

cur.close()
conn.close()
print("Done!")
