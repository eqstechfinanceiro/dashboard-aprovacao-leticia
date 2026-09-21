import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()

# Fix: feita_pelo_bot = true ONLY when usuario = 'bot.contabil'
cur.execute("""
  UPDATE resultados_notas
  SET feita_pelo_bot = false
  WHERE usuario != 'bot.contabil' AND feita_pelo_bot = true
""")
print(f"Corrigidas entradas humanas com bot=true -> false: {cur.rowcount}")

conn.commit()

# Verify
cur.execute("""
  SELECT usuario, fonte, feita_pelo_bot, COUNT(*)
  FROM resultados_notas
  WHERE data = '2026-08-26'
  GROUP BY usuario, fonte, feita_pelo_bot
  ORDER BY usuario, fonte
""")
print("\nHoje apos correcao:")
for r in cur.fetchall():
    print(f"  usuario={r[0]:20s} fonte={r[1]:25s} bot={str(r[2]):5s} count={r[3]}")

cur.close()
conn.close()
