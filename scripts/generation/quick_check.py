import psycopg2
conn = psycopg2.connect("postgresql://neondb_owner:npg_iItZN95svyEG@ep-restless-voice-amrrz188-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require")
cur = conn.cursor()
cur.execute("SELECT cpf, tarifa FROM quinzena_frozen_snapshots WHERE year=2026 AND month=8 AND quinzena=2 AND cpf='08247635992'")
print("JORGE:", cur.fetchall())
cur.execute("SELECT cpf, tarifa FROM quinzena_frozen_snapshots WHERE year=2026 AND month=8 AND quinzena=2 AND cpf='02027745203'")
print("ABNER:", cur.fetchall())
cur.close()
conn.close()
