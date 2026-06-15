"""
Script para baixar expenses da API e salvar diretamente no banco SQLite
Pode rodar em segundo plano enquanto trabalhamos em outras verificações
"""
import subprocess
import json
import sqlite3
import time
import os
from datetime import datetime

API_KEY = "N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8"
BASE_URL = "https://api.vexpenses.com"

def create_expenses_table():
    """Cria a tabela expenses no banco se não existir"""
    conn = sqlite3.connect('data/spreadsheets.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY,
            data TEXT,
            user_id INTEGER,
            user_name TEXT,
            user_cpf TEXT,
            costs_center_id INTEGER,
            costs_center_name TEXT,
            costs_center_description TEXT,
            payment_method_id INTEGER,
            payment_method_name TEXT,
            expense_type_id INTEGER,
            expense_type_description TEXT,
            report_id INTEGER,
            report_status TEXT,
            value REAL,
            original_currency_iso TEXT,
            reimbursable BOOLEAN,
            description TEXT,
            notes TEXT,
            created_at TEXT,
            updated_at TEXT,
            downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()
    print("Tabela expenses criada/verificada")

def get_db_ids():
    """Retorna IDs que já existem no banco"""
    conn = sqlite3.connect('data/spreadsheets.db')
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM expenses')
    existing_ids = set(row[0] for row in cursor.fetchall())
    conn.close()
    return existing_ids

def get_spreadsheet_ids():
    """Retorna IDs que existem na planilha controle_base_prestacoes"""
    conn = sqlite3.connect('data/spreadsheets.db')
    cursor = conn.cursor()
    cursor.execute('SELECT id_da_despesa FROM controle_base_prestacoes WHERE id_da_despesa IS NOT NULL')
    ids = set(int(float(row[0])) for row in cursor.fetchall() if row[0])
    conn.close()
    return ids

def download_expense(expense_id):
    """Baixa um expense específico da API"""
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
        
        expense = data['data']
        
        # Extrair dados de dentro da chave 'data' dos includes
        user_data = expense.get('user', {}).get('data', {}) if expense.get('user') else {}
        costs_center_data = expense.get('costs_center', {}).get('data', {}) if expense.get('costs_center') else {}
        payment_method_data = expense.get('payment_method', {}).get('data', {}) if expense.get('payment_method') else {}
        expense_type_data = expense.get('expense_type', {}).get('data', {}) if expense.get('expense_type') else {}
        
        # Report pode ser uma lista ou um objeto
        report_obj = expense.get('report')
        if isinstance(report_obj, list) and report_obj:
            report_data = report_obj[0].get('data', {}) if report_obj[0].get('data') else {}
        elif isinstance(report_obj, dict):
            report_data = report_obj.get('data', {}) if report_obj.get('data') else {}
        else:
            report_data = {}
        
        return {
            'id': expense.get('id'),
            'data': expense.get('date'),
            'user_id': user_data.get('id'),
            'user_name': user_data.get('name'),
            'user_cpf': user_data.get('cpf'),
            'costs_center_id': costs_center_data.get('id'),
            'costs_center_name': costs_center_data.get('name'),
            'costs_center_description': costs_center_data.get('description'),
            'payment_method_id': payment_method_data.get('id'),
            'payment_method_name': payment_method_data.get('description'),  # Usar description em vez de name
            'expense_type_id': expense_type_data.get('id'),
            'expense_type_description': expense_type_data.get('description'),
            'report_id': report_data.get('id'),
            'report_status': report_data.get('status'),
            'value': expense.get('value'),
            'original_currency_iso': expense.get('original_currency_iso'),
            'reimbursable': expense.get('reimbursable'),
            'description': expense.get('description'),
            'notes': expense.get('notes'),
            'created_at': expense.get('created_at'),
            'updated_at': expense.get('updated_at')
        }
    except json.JSONDecodeError:
        return None

def save_expense_to_db(expense_data):
    """Salva um expense no banco SQLite"""
    conn = sqlite3.connect('data/spreadsheets.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT OR REPLACE INTO expenses (
            id, data, user_id, user_name, user_cpf,
            costs_center_id, costs_center_name, costs_center_description,
            payment_method_id, payment_method_name,
            expense_type_id, expense_type_description,
            report_id, report_status, value, original_currency_iso,
            reimbursable, description, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        expense_data['id'], expense_data['data'], expense_data['user_id'], expense_data['user_name'], expense_data['user_cpf'],
        expense_data['costs_center_id'], expense_data['costs_center_name'], expense_data['costs_center_description'],
        expense_data['payment_method_id'], expense_data['payment_method_name'],
        expense_data['expense_type_id'], expense_data['expense_type_description'],
        expense_data['report_id'], expense_data['report_status'], expense_data['value'], expense_data['original_currency_iso'],
        expense_data['reimbursable'], expense_data['description'], expense_data['notes'], 
        expense_data['created_at'], expense_data['updated_at']
    ))
    
    conn.commit()
    conn.close()

def main():
    print("=" * 80)
    print("Download de expenses para banco SQLite")
    print("=" * 80)
    
    # Criar tabela se não existir
    create_expenses_table()
    
    # Obter IDs necessários
    existing_ids = get_db_ids()
    spreadsheet_ids = get_spreadsheet_ids()
    
    print(f"IDs na planilha: {len(spreadsheet_ids):,}")
    print(f"IDs já no banco: {len(existing_ids):,}")
    
    # IDs que precisam ser baixados
    ids_to_download = spreadsheet_ids - existing_ids
    print(f"IDs para baixar: {len(ids_to_download):,}")
    
    if not ids_to_download:
        print("Todos os IDs já estão no banco!")
        return
    
    # Converter para lista ordenada para progresso consistente
    ids_to_download = sorted(list(ids_to_download))
    
    # Estatísticas
    start_time = datetime.now()
    downloaded = 0
    errors = 0
    
    print(f"\nIniciando download em {start_time.strftime('%H:%M:%S')}")
    print("-" * 80)
    
    for i, expense_id in enumerate(ids_to_download):
        # Progresso a cada 100 downloads
        if (i + 1) % 100 == 0:
            elapsed = (datetime.now() - start_time).total_seconds()
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            remaining = (len(ids_to_download) - i - 1) / rate if rate > 0 else 0
            eta = datetime.now() + timedelta(seconds=remaining)
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Progresso: {i+1:,}/{len(ids_to_download):,} ({(i+1)/len(ids_to_download)*100:.1f}%) - Taxa: {rate:.1f} IDs/s - ETA: {eta.strftime('%H:%M:%S')}")
        
        # Baixar expense
        expense_data = download_expense(expense_id)
        
        if expense_data:
            save_expense_to_db(expense_data)
            downloaded += 1
        else:
            errors += 1
            if errors <= 10:  # Mostrar apenas os primeiros 10 erros
                print(f"Erro ao baixar ID {expense_id}")
        
        # Pequena pausa para evitar rate limiting
        time.sleep(0.2)
    
    # Resumo final
    end_time = datetime.now()
    total_time = (end_time - start_time).total_seconds()
    
    print("\n" + "=" * 80)
    print("DOWNLOAD CONCLUÍDO")
    print("=" * 80)
    print(f"Início: {start_time.strftime('%H:%M:%S')}")
    print(f"Fim: {end_time.strftime('%H:%M:%S')}")
    print(f"Tempo total: {total_time/3600:.1f} horas")
    print(f"IDs baixados: {downloaded:,}")
    print(f"Erros: {errors:,}")
    print(f"Taxa média: {len(ids_to_download)/total_time:.1f} IDs/s")
    
    # Verificar banco
    final_count = len(get_db_ids())
    print(f"Total de expenses no banco: {final_count:,}")
    
    print("\nAgora você pode usar os dados do banco para as verificações!")

if __name__ == "__main__":
    from datetime import timedelta
    main()
