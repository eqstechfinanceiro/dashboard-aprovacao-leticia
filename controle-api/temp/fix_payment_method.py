"""
Atualizar payment_method_name nos registros existentes usando a API
"""
import subprocess
import json
import sqlite3
import time

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"

def get_payment_method_description(expense_id):
    """Baixa payment_method.description de um expense"""
    url = f"{BASE_URL}/v2/expenses/{expense_id}?include=payment_method"
    
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
        
        expense = data['data']
        pm = expense.get('payment_method', {}).get('data', {})
        return pm.get('description')
    except json.JSONDecodeError:
        return None

def main():
    conn = sqlite3.connect('data/spreadsheets.db')
    cursor = conn.cursor()
    
    # Buscar IDs que têm payment_method_id mas não payment_method_name
    cursor.execute('SELECT id FROM expenses WHERE payment_method_id IS NOT NULL AND (payment_method_name IS NULL OR payment_method_name = "")')
    ids_to_fix = [row[0] for row in cursor.fetchall()]
    
    print(f"IDs para corrigir: {len(ids_to_fix):,}")
    
    if not ids_to_fix:
        print("Nenhum registro para corrigir")
        conn.close()
        return
    
    updated = 0
    errors = 0
    
    for i, expense_id in enumerate(ids_to_fix):
        description = get_payment_method_description(expense_id)
        
        if description:
            cursor.execute('UPDATE expenses SET payment_method_name = ? WHERE id = ?', (description, expense_id))
            conn.commit()
            updated += 1
        else:
            errors += 1
        
        if (i + 1) % 100 == 0:
            print(f"Progresso: {i+1}/{len(ids_to_fix)} ({(i+1)/len(ids_to_fix)*100:.1f}%)")
        
        time.sleep(0.2)  # Delay para evitar rate limiting
    
    print(f"\nAtualizados: {updated:,}")
    print(f"Erros: {errors:,}")
    
    conn.close()

if __name__ == "__main__":
    main()
