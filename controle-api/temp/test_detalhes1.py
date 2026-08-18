import sys
sys.path.insert(0, '.')
import sqlite3
from src import api_client
from src.checks.controle_detalhes1 import ALL_CHECKS

conn = sqlite3.connect('data/spreadsheets.db')
print('Testing controle_detalhes1 checks...\n')

results = []
for check in ALL_CHECKS:
    try:
        result = check.run(conn, api_client)
        results.append((check, result))
        print(f'{check.display}: {result.status} - {result.note}')
    except Exception as e:
        print(f'{check.display}: ERROR - {e}')
        import traceback
        traceback.print_exc()

conn.close()
