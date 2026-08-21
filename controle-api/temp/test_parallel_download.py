"""
Test script para download paralelo com amostra pequena
"""
import subprocess
import json
import sqlite3
import time
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"
DB_LOCK = Lock()

def download_expense(expense_id, delay=0):
    """Baixa um expense específico da API"""
    time.sleep(delay)  # Delay para evitar rate limiting
    
    url = f"{BASE_URL}/v2/expenses/{expense_id}?include=user,costs_center,payment_method,expense_type,report,apportionment"
    
    response = subprocess.run(
        ["curl.exe", "-s", "-H", f"Authorization: {API_KEY}", "-H", "Accept: application/json", url],
        capture_output=True,
        text=True
    )
    
    if response.returncode != 0:
        return None
    
    try:
        data = json.loads(response.stdout)
        if not data.get('success') or 'data' not in data or not data['data']:
            return None
        return data['data']
    except json.JSONDecodeError:
        return None

def main():
    print("=" * 60)
    print("Teste de download paralelo (50 IDs)")
    print("=" * 60)
    
    # Obter amostra de 50 IDs
    conn = sqlite3.connect('data/spreadsheets.db')
    cursor = conn.cursor()
    cursor.execute('SELECT id_da_despesa FROM controle_base_prestacoes WHERE id_da_despesa IS NOT NULL LIMIT 50')
    sample_ids = [int(float(row[0])) for row in cursor.fetchall()]
    conn.close()
    
    print(f"Amostra de {len(sample_ids)} IDs")
    
    # Testar com diferentes números de threads e delays
    for num_threads, delay in [(1, 0), (2, 0.1), (3, 0.2)]:
        print(f"\n--- Testando com {num_threads} threads (delay={delay}s) ---")
        start_time = datetime.now()
        downloaded = 0
        errors = 0
        
        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            future_to_id = {executor.submit(download_expense, eid, delay): eid for eid in sample_ids}
            
            for future in as_completed(future_to_id):
                expense_id = future_to_id[future]
                try:
                    result = future.result()
                    if result:
                        downloaded += 1
                    else:
                        errors += 1
                except Exception as e:
                    errors += 1
        
        elapsed = (datetime.now() - start_time).total_seconds()
        rate = len(sample_ids) / elapsed if elapsed > 0 else 0
        
        print(f"Tempo: {elapsed:.1f}s")
        print(f"Baixados: {downloaded}")
        print(f"Erros: {errors}")
        print(f"Taxa: {rate:.1f} IDs/s")
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()
