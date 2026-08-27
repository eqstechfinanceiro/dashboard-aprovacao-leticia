import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()

cur.execute("""
  SELECT usuario, fonte, COUNT(*) as total
  FROM resultados_notas
  WHERE data = '2026-08-26'
  GROUP BY usuario, fonte
  ORDER BY total DESC
""")
rows = cur.fetchall()
print("Entradas de hoje (2026-08-26) por usuario + fonte:")
for r in rows:
    print(f"  usuario={r[0]:20s} fonte={r[1]:25s} count={r[2]}")

cur.execute("""
  SELECT COUNT(*) FROM resultados_notas
  WHERE data = '2026-08-26' AND usuario != 'bot.contabil'
""")
non_bot = cur.fetchone()[0]
print(f"\nTotal de entradas hoje NAO do bot.contabil: {non_bot}")

cur.execute("SELECT COUNT(*) FROM resultados_notas WHERE data = '2026-08-26'")
total = cur.fetchone()[0]
print(f"Total de entradas hoje: {total}")

cur.close()
conn.close()
