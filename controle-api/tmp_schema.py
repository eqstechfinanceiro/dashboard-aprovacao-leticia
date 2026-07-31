import os, psycopg2
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.getenv("NEON_DATABASE_URL"))
cur = conn.cursor()
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='quinzena_cadastro' ORDER BY ordinal_position")
print([r[0] for r in cur.fetchall()])
conn.close()
