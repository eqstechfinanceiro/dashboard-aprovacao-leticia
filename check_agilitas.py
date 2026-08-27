import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()

# 1. Check if there are any entries with "agilitas" anywhere
cur.execute("""
  SELECT DISTINCT fonte, tipo, COUNT(*)
  FROM resultados_notas
  WHERE fonte ILIKE '%agilitas%' OR tipo ILIKE '%agilitas%' OR titulo ILIKE '%agilitas%'
  GROUP BY fonte, tipo
""")
rows = cur.fetchall()
print("Entradas com 'agilitas':", len(rows))
for r in rows:
    print(f"  fonte={r[0]} tipo={r[1]} count={r[2]}")

# 2. Check all distinct tipos
cur.execute("SELECT DISTINCT tipo, COUNT(*) FROM resultados_notas GROUP BY tipo ORDER BY COUNT(*) DESC")
print("\nTipos existentes:")
for r in cur.fetchall():
    print(f"  tipo={r[0]} count={r[1]}")

# 3. Check all distinct fontes
cur.execute("SELECT DISTINCT fonte, COUNT(*) FROM resultados_notas GROUP BY fonte ORDER BY COUNT(*) DESC")
print("\nFontes existentes:")
for r in cur.fetchall():
    print(f"  fonte={r[0]} count={r[1]}")

# 4. Check table schema
cur.execute("""
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'resultados_notas'
  ORDER BY ordinal_position
""")
print("\nSchema resultados_notas:")
for r in cur.fetchall():
    print(f"  {r[0]:25s} {r[1]:30s} nullable={r[2]} default={r[3]}")

# 5. Sample some entries to understand the structure
cur.execute("SELECT * FROM resultados_notas ORDER BY id DESC LIMIT 3")
cols = [desc[0] for desc in cur.description]
print("\nSample entries:")
for row in cur.fetchall():
    print("---")
    for i, val in enumerate(row):
        print(f"  {cols[i]}: {val}")

cur.close()
conn.close()
