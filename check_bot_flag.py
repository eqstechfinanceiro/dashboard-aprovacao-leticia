import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()

cur.execute("""
  SELECT usuario, fonte, feita_pelo_bot, COUNT(*)
  FROM resultados_notas
  WHERE data = '2026-08-26'
  GROUP BY usuario, fonte, feita_pelo_bot
  ORDER BY usuario, fonte
""")
rows = cur.fetchall()
print("Hoje por usuario + fonte + feita_pelo_bot:")
for r in rows:
    print(f"  usuario={r[0]:20s} fonte={r[1]:25s} bot={str(r[2]):5s} count={r[3]}")

cur.close()
conn.close()
